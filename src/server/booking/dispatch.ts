import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { getPublicAvailability } from "../public-booking/availability";
import type { PublicSessionContext } from "../public-booking/context";
import { sha256 } from "../security/crypto";
import { addLocalDays, formatDateInTimeZone, zonedDateTimeToUtc } from "../time/timezone";
import { requireConfiguredWalkInStart } from "./walkin-policy";

export type DispatchMode = "immediate" | "future";
type Claim = { id: string; staffId: string; status: string; expiresAt: Date };

export async function assignUnspecifiedBooking(
  context: PublicSessionContext,
  serviceVariantId: string,
  interval: { startsAt: string },
  mode: DispatchMode,
  idempotencyKey: string,
): Promise<{ claimId: string; staffProfileId: string;
  bypassOnlineLead: boolean }> {
  const startsAt = new Date(interval.startsAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    throw new AppError("BAD_REQUEST", "Invalid dispatch time", 400);
  }
  const bypassOnlineLead = mode === "immediate" ?
    (await requireConfiguredWalkInStart(context.organizationId,
      context.locationId,startsAt)).bypassOnlineLead : false;
  const date = formatDateInTimeZone(startsAt, context.timezone);
  const availability = await getPublicAvailability(context, { serviceVariantId, date },
    new Date(), bypassOnlineLead ? 0 : undefined);
  const candidates = availability.slots.find(slot => slot.startsAt === startsAt.toISOString())
    ?.availableStaff ?? [];
  if (!candidates.length) throw new AppError("CONFLICT", "No qualified staff or resource", 409);
  const dayStart = zonedDateTimeToUtc(date, "00:00", context.timezone);
  const dayEnd = zonedDateTimeToUtc(addLocalDays(date, 1), "00:00", context.timezone);
  const keyHash = sha256(idempotencyKey);
  return prisma.$transaction(async transaction => {
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${context.organizationId}),
        hashtext(${context.locationId}))
    `);
    const prior = await transaction.$queryRaw<Claim[]>(Prisma.sql`
      select id, staff_profile_id as "staffId", status,
        expires_at as "expiresAt" from public.booking_dispatch_claims
      where organization_id = ${context.organizationId}::uuid
        and location_id = ${context.locationId}::uuid
        and idempotency_hash = ${keyHash}
      for update
    `);
    if (prior[0]) {
      if (prior[0].status === "FAILED" ||
          (prior[0].status === "PENDING" && prior[0].expiresAt <= new Date())) {
        throw new AppError("CONFLICT", "Dispatch claim expired", 409);
      }
      return { claimId: prior[0].id, staffProfileId: prior[0].staffId,
        bypassOnlineLead };
    }
    const score = await transaction.$queryRaw<{ staffId: string; rotationCount: bigint;
      pendingCount: bigint }[]>(Prisma.sql`
      with candidates as (select unnest(${candidates}::uuid[]) as staff_id),
      rotation as (
        select event.staff_profile_id,
          sum(case when event.event_type in ('IMMEDIATE_ASSIGNED', 'REASSIGNED') then 1
            when event.event_type = 'PRESTART_COMPENSATED' then -1 else 0 end) as count
        from public.booking_dispatch_events event
        join public.booking_dispatch_claims claim on claim.id = event.claim_id
        where event.organization_id = ${context.organizationId}::uuid
          and event.location_id = ${context.locationId}::uuid
          and claim.mode = 'IMMEDIATE'
          and claim.starts_at >= ${dayStart} and claim.starts_at < ${dayEnd}
        group by event.staff_profile_id
      ), pending as (
        select staff_profile_id, count(*) as count
        from public.booking_dispatch_claims
        where organization_id = ${context.organizationId}::uuid
          and location_id = ${context.locationId}::uuid
          and mode = 'IMMEDIATE' and status = 'PENDING'
          and expires_at > now() and starts_at >= ${dayStart} and starts_at < ${dayEnd}
        group by staff_profile_id
      )
      select candidates.staff_id as "staffId",
        coalesce(rotation.count, 0) as "rotationCount",
        coalesce(pending.count, 0) as "pendingCount"
      from candidates
      left join rotation on rotation.staff_profile_id = candidates.staff_id
      left join pending on pending.staff_profile_id = candidates.staff_id
    `);
    const sorted = score.sort((left, right) => {
      const a = mode === "immediate" ? left.rotationCount + left.pendingCount : BigInt(0);
      const b = mode === "immediate" ? right.rotationCount + right.pendingCount : BigInt(0);
      return a < b ? -1 : a > b ? 1 : left.staffId.localeCompare(right.staffId);
    });
    const selected = sorted[0];
    if (!selected) throw new AppError("CONFLICT", "No available staff", 409);
    const claim = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.booking_dispatch_claims
        (organization_id, location_id, service_variant_id, staff_profile_id,
         idempotency_hash, mode, starts_at, expires_at)
      values (${context.organizationId}::uuid, ${context.locationId}::uuid,
        ${serviceVariantId}::uuid, ${selected.staffId}::uuid,
        ${keyHash}, ${mode === "immediate" ? "IMMEDIATE" : "FUTURE"},
        ${startsAt}, now() + interval '5 minutes') returning id
    `);
    return { claimId: claim[0].id, staffProfileId: selected.staffId,
      bypassOnlineLead };
  });
}

export async function failDispatchClaim(claimId: string, organizationId: string,
  locationId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    update public.booking_dispatch_claims set status = 'FAILED'
    where id = ${claimId}::uuid and organization_id = ${organizationId}::uuid
      and location_id = ${locationId}::uuid and status = 'PENDING'
  `);
}

export async function compensatePrestartDispatch(transaction: Prisma.TransactionClient,
  bookingId: string, organizationId: string, locationId: string,
  reason: string): Promise<void> {
  await transaction.$executeRaw(Prisma.sql`
    insert into public.booking_dispatch_events
      (organization_id, location_id, claim_id, booking_id,
       staff_profile_id, event_type, reason)
    select claim.organization_id, claim.location_id, claim.id, booking.id,
      claim.staff_profile_id, 'PRESTART_COMPENSATED', ${reason}
    from public.booking_dispatch_claims claim
    join public.bookings booking on booking.id = claim.booking_id
      and booking.organization_id = claim.organization_id
    where claim.organization_id = ${organizationId}::uuid
      and claim.location_id = ${locationId}::uuid
      and claim.booking_id = ${bookingId}::uuid
      and claim.mode = 'IMMEDIATE' and claim.status = 'CONFIRMED'
      and claim.starts_at > now() and booking.service_started_at is null
    on conflict do nothing
  `);
}
