import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

export type WalkInPolicy = { earliestStartMinutes: number; setupBufferMinutes: number;
  onlineMinimumAdvanceApplies: boolean; version: number };

export async function getWalkInPolicy(organizationId: string, locationId: string):
  Promise<WalkInPolicy | null> {
  const rows = await prisma.$queryRaw<WalkInPolicy[]>(Prisma.sql`
    select earliest_start_minutes as "earliestStartMinutes",
      setup_buffer_minutes as "setupBufferMinutes",
      online_minimum_advance_applies as "onlineMinimumAdvanceApplies",version
    from public.store_walkin_policies
    where organization_id=${organizationId}::uuid and location_id=${locationId}::uuid
  `);
  return rows[0] ?? null;
}

export function validateWalkInStart(startsAt: Date, now: Date,
  policy: WalkInPolicy, onlineLeadMinutes: number): void {
  const managerMinimum = policy.earliestStartMinutes + policy.setupBufferMinutes;
  const required = policy.onlineMinimumAdvanceApplies ?
    Math.max(managerMinimum,onlineLeadMinutes) : managerMinimum;
  if (!Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() < now.getTime()+required*60_000) {
    throw new AppError("CONFLICT", "Walk-in start is earlier than configured policy", 409);
  }
}

export async function requireConfiguredWalkInStart(organizationId: string,
  locationId: string, startsAt: Date): Promise<{ bypassOnlineLead: boolean }> {
  const policy = await getWalkInPolicy(organizationId,locationId);
  if (!policy) throw new AppError("FEATURE_UNAVAILABLE",
    "Walk-in policy is not configured", 503);
  const online = await prisma.location_booking_policies.findUnique({
    where: { location_id: locationId }, select: { minimum_lead_minutes: true },
  });
  validateWalkInStart(startsAt,new Date(),policy,online?.minimum_lead_minutes ?? 0);
  return { bypassOnlineLead: !policy.onlineMinimumAdvanceApplies };
}

export async function configureWalkInPolicy(input: { context: OrganizationContext;
  earliestStartMinutes: number; setupBufferMinutes: number;
  onlineMinimumAdvanceApplies: boolean; expectedVersion?: number;
  requestId: string }): Promise<WalkInPolicy> {
  assertCapability(input.context,"location.manage");
  const location = requireLocation(input.context);
  if (!Number.isInteger(input.earliestStartMinutes) ||
      input.earliestStartMinutes < 0 || input.earliestStartMinutes > 1440 ||
      !Number.isInteger(input.setupBufferMinutes) || input.setupBufferMinutes < 0 ||
      input.setupBufferMinutes > 240) {
    throw new AppError("BAD_REQUEST", "Invalid walk-in timing", 400);
  }
  return prisma.$transaction(async transaction => {
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${input.context.organization.id}),
        hashtext(${location.id}))
    `);
    const before = await transaction.$queryRaw<WalkInPolicy[]>(Prisma.sql`
      select earliest_start_minutes as "earliestStartMinutes",
        setup_buffer_minutes as "setupBufferMinutes",
        online_minimum_advance_applies as "onlineMinimumAdvanceApplies",version
      from public.store_walkin_policies
      where organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid for update
    `);
    if (before[0] && input.expectedVersion !== before[0].version ||
        !before[0] && input.expectedVersion !== undefined) {
      throw new AppError("CONFLICT", "Walk-in policy version changed", 409);
    }
    const rows = await transaction.$queryRaw<WalkInPolicy[]>(Prisma.sql`
      insert into public.store_walkin_policies
        (organization_id,location_id,earliest_start_minutes,setup_buffer_minutes,
         online_minimum_advance_applies,configured_by_profile_id)
      values (${input.context.organization.id}::uuid,${location.id}::uuid,
        ${input.earliestStartMinutes},${input.setupBufferMinutes},
        ${input.onlineMinimumAdvanceApplies},${input.context.session.profileId}::uuid)
      on conflict (organization_id,location_id) do update
      set earliest_start_minutes=excluded.earliest_start_minutes,
        setup_buffer_minutes=excluded.setup_buffer_minutes,
        online_minimum_advance_applies=excluded.online_minimum_advance_applies,
        configured_by_profile_id=excluded.configured_by_profile_id,
        configured_at=now(),version=public.store_walkin_policies.version+1
      returning earliest_start_minutes as "earliestStartMinutes",
        setup_buffer_minutes as "setupBufferMinutes",
        online_minimum_advance_applies as "onlineMinimumAdvanceApplies",version
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id, location_id: location.id,
      actor_profile_id: input.context.session.profileId,
      action: "WALKIN_POLICY_CONFIGURED", target_type: "LOCATION",
      target_id: location.id, outcome: "SUCCESS", request_id: input.requestId,
      before_json: before[0] ?? undefined, after_json: rows[0],
    } });
    return rows[0];
  });
}
