import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

function assertLocalPayroll(): void {
  if (process.env.APP_ENV !== "test" || process.env.PAYROLL_TEST_ONLY !== "true") {
    throw new AppError("FEATURE_UNAVAILABLE", "Payroll is not activated", 503);
  }
}

export async function publishPayrollRule(input: { context: OrganizationContext;
  ruleId: string; requestId: string }): Promise<void> {
  assertLocalPayroll();
  assertCapability(input.context, "billing.manage");
  await prisma.$transaction(async transaction => {
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${input.context.organization.id}), 20261007)
    `);
    const rows = await transaction.$queryRaw<{ id: string; locationId: string | null;
      profileId: string | null; from: Date; until: Date }[]>(Prisma.sql`
      select id, location_id as "locationId", profile_id as "profileId",
        effective_from as "from", effective_until as "until"
      from public.payroll_rule_versions
      where id=${input.ruleId}::uuid
        and organization_id=${input.context.organization.id}::uuid
        and published_at is null for update
    `);
    const rule = rows[0];
    if (!rule) throw new AppError("NOT_FOUND", "Draft payroll rule not found", 404);
    const conflicts = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.payroll_rule_versions
      where organization_id=${input.context.organization.id}::uuid
        and id<>${rule.id}::uuid and published_at is not null
        and (location_id is null or ${rule.locationId}::uuid is null
          or location_id=${rule.locationId}::uuid)
        and (profile_id is null or ${rule.profileId}::uuid is null
          or profile_id=${rule.profileId}::uuid)
        and daterange(effective_from,effective_until,'[)') &&
          daterange(${rule.from}::date,${rule.until}::date,'[)')
      limit 1
    `);
    if (conflicts[0]) throw new AppError("CONFLICT", "Payroll rule period overlaps", 409);
    await transaction.$executeRaw(Prisma.sql`
      update public.payroll_rule_versions set published_at=now(),
        published_by_profile_id=${input.context.session.profileId}::uuid
      where id=${rule.id}::uuid
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id,
      location_id: rule.locationId,
      actor_profile_id: input.context.session.profileId,
      action: "PAYROLL_RULE_PUBLISHED", target_type: "PAYROLL_RULE",
      target_id: rule.id, outcome: "SUCCESS", request_id: input.requestId,
      after_json: { ruleId: rule.id },
    } });
  });
}

export async function approveOvertime(input: { context: OrganizationContext;
  clockInEventId: string; approvedMinutes: number; reason: string }): Promise<void> {
  assertLocalPayroll();
  assertCapability(input.context, "staff.manage");
  const location = requireLocation(input.context);
  if (!Number.isInteger(input.approvedMinutes) || input.approvedMinutes <= 0 ||
      !input.reason.trim()) throw new AppError("BAD_REQUEST", "Invalid overtime approval", 400);
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    select id from public.staff_attendance_events
    where id=${input.clockInEventId}::uuid
      and organization_id=${input.context.organization.id}::uuid
      and location_id=${location.id}::uuid and kind='CLOCK_IN'
  `);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Clock-in not found", 404);
  await prisma.$executeRaw(Prisma.sql`
    insert into public.payroll_overtime_approvals
      (organization_id,clock_in_event_id,approved_minutes,reason,approved_by_profile_id)
    values (${input.context.organization.id}::uuid,${input.clockInEventId}::uuid,
      ${input.approvedMinutes},${input.reason.trim()},
      ${input.context.session.profileId}::uuid)
  `);
}

export async function approveLeave(input: { context: OrganizationContext;
  profileId: string; startsAt: Date; endsAt: Date; paid: boolean;
  reason: string }): Promise<string> {
  assertLocalPayroll();
  assertCapability(input.context, "staff.manage");
  const location = requireLocation(input.context);
  if (input.endsAt <= input.startsAt || !input.reason.trim()) {
    throw new AppError("BAD_REQUEST", "Invalid leave approval", 400);
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into public.payroll_leave_approvals
      (organization_id,location_id,profile_id,starts_at,ends_at,
       paid,reason,approved_by_profile_id)
    values (${input.context.organization.id}::uuid,${location.id}::uuid,
      ${input.profileId}::uuid,${input.startsAt},${input.endsAt},
      ${input.paid},${input.reason.trim()},
      ${input.context.session.profileId}::uuid) returning id
  `);
  return rows[0].id;
}
