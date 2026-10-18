import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { hasCapability } from "@/server/authorization/capabilities";
import { requireLocation } from "@/server/authorization/context";
import { prisma } from "@/server/database/prisma";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { AppError } from "@/server/http/errors";
import { approvePayrollPeriod, createPayrollAdjustment,
  getPayslip } from "@/server/payroll/approval";
import { calculatePayrollPeriod } from "@/server/payroll/calculation";
import { approveOvertime } from "@/server/payroll/rules";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";
import { approveClockCorrection } from "@/server/staff/attendance";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CORRECT_CLOCK"), eventId: z.uuid(),
    correctedAt: z.iso.datetime({ offset: true }), reason: z.string().trim().min(1) }).strict(),
  z.object({ action: z.literal("APPROVE_OVERTIME"), clockInEventId: z.uuid(),
    approvedMinutes: z.number().int().positive(), reason: z.string().trim().min(1) }).strict(),
  z.object({ action: z.literal("CALCULATE_PAYROLL"), employeeId: z.uuid(),
    from: z.iso.date(), until: z.iso.date(), ruleId: z.uuid() }).strict(),
  z.object({ action: z.literal("APPROVE_PAYROLL"), periodId: z.uuid(),
    reviewReason: z.string().trim().optional() }).strict(),
  z.object({ action: z.literal("ADJUST_REFUND"), originalPeriodId: z.uuid(),
    bookingRefundId: z.uuid(), appliesOn: z.iso.date(), idempotencyKey: z.string().min(12) }).strict(),
]);

async function contextFor(request: NextRequest) {
  const session = await requireRequestSession(request);
  const scope = merchantScopeSchema.parse({
    organization: request.nextUrl.searchParams.get("organization"),
    location: request.nextUrl.searchParams.get("location"),
  });
  return { session, context: await resolveMerchantContext({ session,
    organizationSlug: scope.organization, locationSlug: scope.location }) };
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { context } = await contextFor(request);
    const location = requireLocation(context);
    if (!hasCapability(context.roles, "staff.manage") &&
        !hasCapability(context.roles, "billing.read")) {
      throw new AppError("FORBIDDEN", "Operations review denied", 403);
    }
    const periodId = request.nextUrl.searchParams.get("periodId");
    if (periodId) return jsonSuccess({ payslip: await getPayslip(context,
      z.uuid().parse(periodId)) });
    const [attendance, periods, rules, employees, staff] = await Promise.all([
      hasCapability(context.roles, "staff.manage") ? prisma.$queryRaw<{
        id: string; profileId: string; kind: string; occurredAt: Date;
        correctedAt: Date | null }[]>(Prisma.sql`
        select event.id,event.profile_id as "profileId",event.kind,
          event.occurred_at as "occurredAt",correction.corrected_at as "correctedAt"
        from public.staff_attendance_events event
        left join public.staff_attendance_corrections correction on correction.event_id=event.id
        where event.organization_id=${context.organization.id}::uuid
          and event.location_id=${location.id}::uuid
        order by event.occurred_at desc limit 50
      `) : [],
      hasCapability(context.roles, "billing.read") ? prisma.$queryRaw<{
        id: string; profileId: string; from: Date; until: Date;
        totalMinor: bigint; status: string; revision: number }[]>(Prisma.sql`
        select id,profile_id as "profileId",period_from as "from",
          period_until as "until",total_minor as "totalMinor",status,revision
        from public.payroll_periods
        where organization_id=${context.organization.id}::uuid
          and location_id=${location.id}::uuid
        order by created_at desc limit 50
      `) : [],
      hasCapability(context.roles, "billing.read") ? prisma.$queryRaw<{
        id: string; version: number; profileId: string | null }[]>(Prisma.sql`
        select id,version,profile_id as "profileId"
        from public.payroll_rule_versions
        where organization_id=${context.organization.id}::uuid
          and (location_id is null or location_id=${location.id}::uuid)
          and published_at is not null order by effective_from desc limit 20
      `) : [],
      prisma.location_memberships.findMany({ where: {
        organization_id: context.organization.id, location_id: location.id,
        status: "ACTIVE" }, select: { profile_id: true,
        profiles: { select: { display_name: true } } } }),
      prisma.staff_profiles.findMany({ where: {
        organization_id: context.organization.id, is_active: true,
        staff_location_assignments: { some: {
          location_id: location.id, is_active: true } },
      }, select: { id: true, display_name: true } }),
    ]);
    if (request.nextUrl.searchParams.get("format") === "csv") {
      if (!hasCapability(context.roles, "staff.manage")) {
        throw new AppError("FORBIDDEN", "Attendance export denied", 403);
      }
      const csv = ["event_id,profile_id,kind,occurred_at,corrected_at",
        ...attendance.map(row => [row.id,row.profileId,row.kind,
          row.occurredAt.toISOString(),row.correctedAt?.toISOString() ?? ""].join(","))]
        .join("\r\n");
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=attendance-review.csv",
        "Cache-Control": "no-store" } });
    }
    return jsonSuccess({ attendance, periods: periods.map(row => ({ ...row,
      totalMinor: Number(row.totalMinor) })), rules, employees: employees.map(row => ({
      id: row.profile_id, name: row.profiles.display_name })),
      staff: staff.map(row => ({ id: row.id, name: row.display_name })) },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error, requestId); }
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { session, context } = await contextFor(request);
    assertSessionCsrf(request, session);
    const input = command.parse(await request.json());
    switch (input.action) {
      case "CORRECT_CLOCK":
        return jsonSuccess({ correctionId: await approveClockCorrection(context,
          input.eventId as string, new Date(input.correctedAt as string),
          input.reason as string, requestId) });
      case "APPROVE_OVERTIME":
        await approveOvertime({ context, clockInEventId: input.clockInEventId as string,
          approvedMinutes: input.approvedMinutes as number, reason: input.reason as string });
        return jsonSuccess({ approved: true });
      case "CALCULATE_PAYROLL":
        return jsonSuccess(await calculatePayrollPeriod({ context,
          employeeId: input.employeeId as string, from: input.from as string,
          until: input.until as string, ruleId: input.ruleId as string }));
      case "APPROVE_PAYROLL":
        await approvePayrollPeriod({ context, periodId: input.periodId as string,
          reviewReason: input.reviewReason as string | undefined, requestId });
        return jsonSuccess({ approved: true });
      case "ADJUST_REFUND":
        return jsonSuccess(await createPayrollAdjustment({ context,
          originalPeriodId: input.originalPeriodId as string,
          bookingRefundId: input.bookingRefundId as string,
          appliesOn: input.appliesOn as string,
          idempotencyKey: input.idempotencyKey as string }));
      default: throw new AppError("BAD_REQUEST", "Unknown operation", 400);
    }
  } catch (error) { return jsonError(error, requestId); }
}
