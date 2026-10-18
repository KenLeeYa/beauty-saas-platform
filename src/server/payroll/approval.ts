import "server-only";

import { Prisma } from "@prisma/client";

import { hasCapability } from "../authorization/capabilities";
import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { sha256 } from "../security/crypto";
import { buildPayrollSnapshot } from "./calculation";

function assertLocalPayroll(): void {
  if (process.env.APP_ENV !== "test" || process.env.PAYROLL_TEST_ONLY !== "true") {
    throw new AppError("FEATURE_UNAVAILABLE", "Payroll is not activated", 503);
  }
}

type PeriodRow = { id: string; profileId: string; locationId: string;
  from: Date; until: Date; ruleId: string; sourceHash: string;
  totalMinor: bigint; status: string };

export async function approvePayrollPeriod(input: { context: OrganizationContext;
  periodId: string; reviewReason?: string; requestId: string }): Promise<void> {
  assertLocalPayroll();
  assertCapability(input.context, "billing.manage");
  const location = requireLocation(input.context);
  await prisma.$transaction(async transaction => {
    const periods = await transaction.$queryRaw<PeriodRow[]>(Prisma.sql`
      select id, profile_id as "profileId", location_id as "locationId",
        period_from as "from", period_until as "until", rule_id as "ruleId",
        source_hash as "sourceHash", total_minor as "totalMinor", status
      from public.payroll_periods
      where id=${input.periodId}::uuid
        and organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid for update
    `);
    const period = periods[0];
    if (!period) throw new AppError("NOT_FOUND", "Payroll period not found", 404);
    if (period.status !== "DRAFT") throw new AppError("CONFLICT", "Payroll already approved", 409);
    const from = period.from.toISOString().slice(0,10);
    const until = period.until.toISOString().slice(0,10);
    const snapshot = await buildPayrollSnapshot(transaction, {
      organizationId: input.context.organization.id, locationId: location.id,
      profileId: period.profileId, timezone: location.timezone,
      from, until, ruleId: period.ruleId });
    if (snapshot.sourceHash !== period.sourceHash ||
        snapshot.totalMinor !== Number(period.totalMinor)) {
      throw new AppError("CONFLICT", "Payroll sources changed; recalculate draft", 409);
    }
    const reviewLines = snapshot.lines.filter(line => line.kind === "REVIEW_TIME");
    if (reviewLines.length && !input.reviewReason?.trim()) {
      throw new AppError("BAD_REQUEST", "Explain withheld or incomplete time", 400);
    }
    await transaction.$executeRaw(Prisma.sql`
      update public.payroll_periods set status='APPROVED',
        approved_by_profile_id=${input.context.session.profileId}::uuid,
        approved_at=now() where id=${period.id}::uuid and status='DRAFT'
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id, location_id: location.id,
      actor_profile_id: input.context.session.profileId,
      action: "PAYROLL_PERIOD_APPROVED", target_type: "PAYROLL_PERIOD",
      target_id: period.id, outcome: "SUCCESS", request_id: input.requestId,
      after_json: { totalMinor: snapshot.totalMinor,
        sourceHash: snapshot.sourceHash, reviewReason: input.reviewReason ?? null },
    } });
  }, { isolationLevel: "Serializable" });
}

export async function createPayrollAdjustment(input: { context: OrganizationContext;
  originalPeriodId: string; bookingRefundId: string; appliesOn: string;
  idempotencyKey: string }): Promise<{ adjustmentId: string; amountMinor: number }> {
  assertLocalPayroll();
  assertCapability(input.context, "billing.manage");
  const location = requireLocation(input.context);
  return prisma.$transaction(async transaction => {
    const periods = await transaction.$queryRaw<PeriodRow[]>(Prisma.sql`
      select id, profile_id as "profileId", location_id as "locationId",
        period_from as "from", period_until as "until", rule_id as "ruleId",
        source_hash as "sourceHash", total_minor as "totalMinor", status
      from public.payroll_periods where id=${input.originalPeriodId}::uuid
        and organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid for share
    `);
    const period = periods[0];
    if (!period || period.status !== "APPROVED") {
      throw new AppError("CONFLICT", "Approved source period required", 409);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.appliesOn) ||
        input.appliesOn < period.until.toISOString().slice(0,10)) {
      throw new AppError("BAD_REQUEST", "Adjustment must be in a later period", 400);
    }
    const existing = await transaction.$queryRaw<{ id: string; amountMinor: bigint }[]>(Prisma.sql`
      select id, amount_minor as "amountMinor" from public.payroll_adjustments
      where organization_id=${input.context.organization.id}::uuid
        and profile_id=${period.profileId}::uuid
        and idempotency_hash=${sha256(input.idempotencyKey)}
    `);
    if (existing[0]) return { adjustmentId: existing[0].id,
      amountMinor: Number(existing[0].amountMinor) };
    const refund = await transaction.booking_refunds.findFirst({ where: {
      id: input.bookingRefundId, organization_id: input.context.organization.id,
      status: "CONFIRMED",
    }, select: { id: true, booking_id: true, amount_minor: true,
      bookings: { select: { total_minor: true } } } });
    if (!refund) throw new AppError("NOT_FOUND", "Confirmed refund not found", 404);
    const commission = await transaction.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      select coalesce(sum(amount_minor),0)::bigint as total
      from public.payroll_lines
      where period_id=${period.id}::uuid and kind='COMMISSION'
        and amount_minor>0
        and detail->>'bookingId'=${refund.booking_id}
    `);
    const originalCommission = Number(commission[0].total);
    if (originalCommission <= 0 || refund.bookings.total_minor <= 0) {
      throw new AppError("CONFLICT", "No commission to reverse", 409);
    }
    const amountMinor = -Math.floor(originalCommission * refund.amount_minor /
      refund.bookings.total_minor);
    if (amountMinor >= 0) throw new AppError("CONFLICT", "Refund has no reversal", 409);
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.payroll_adjustments
        (organization_id,profile_id,original_period_id,booking_refund_id,
         applies_on,amount_minor,idempotency_hash,created_by_profile_id)
      values (${input.context.organization.id}::uuid,${period.profileId}::uuid,
        ${period.id}::uuid,${refund.id}::uuid,${input.appliesOn}::date,
        ${amountMinor},${sha256(input.idempotencyKey)},
        ${input.context.session.profileId}::uuid) returning id
    `);
    return { adjustmentId: rows[0].id, amountMinor };
  });
}

export async function getPayslip(context: OrganizationContext, periodId: string):
  Promise<{ status: string; totalMinor: number; from: string; until: string;
    lines: Array<{ kind: string; amountMinor: number; minutes: number | null;
      detail: unknown }> }> {
  const period = await prisma.$queryRaw<PeriodRow[]>(Prisma.sql`
    select id, profile_id as "profileId", location_id as "locationId",
      period_from as "from", period_until as "until", rule_id as "ruleId",
      source_hash as "sourceHash", total_minor as "totalMinor", status
    from public.payroll_periods
    where id=${periodId}::uuid and organization_id=${context.organization.id}::uuid
      and location_id=any(${[...context.accessibleLocationIds]}::uuid[])
  `);
  const row = period[0];
  if (!row) throw new AppError("NOT_FOUND", "Payslip not found", 404);
  const payrollReader = hasCapability(context.roles,"billing.read");
  if (!payrollReader && (context.session.profileId !== row.profileId ||
      row.status !== "APPROVED" ||
      !hasCapability(context.roles,"schedule.own.manage"))) {
    throw new AppError("FORBIDDEN", "Payslip access denied", 403);
  }
  const lines = await prisma.$queryRaw<{ kind: string; amountMinor: bigint;
    minutes: number | null; detail: unknown }[]>(Prisma.sql`
    select kind, amount_minor as "amountMinor", minutes, detail
    from public.payroll_lines where period_id=${row.id}::uuid
    order by created_at,id
  `);
  return { status: row.status, totalMinor: Number(row.totalMinor),
    from: row.from.toISOString().slice(0,10),
    until: row.until.toISOString().slice(0,10),
    lines: lines.map(line => ({ ...line, amountMinor: Number(line.amountMinor) })) };
}
