import "server-only";

import { Prisma } from "@prisma/client";

import type { VerifiedMobileActor } from "../auth/line-mobile-session";
import { hasCapability } from "../authorization/capabilities";
import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { sha256 } from "../security/crypto";
import { formatDateInTimeZone } from "../time/timezone";

export type ClockKind = "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "CLOCK_OUT";
export type AttendanceEvent = { id: string; locationId: string;
  kind: ClockKind; occurredAt: Date; correctedAt: Date | null };

export async function recordClockEvent(actor: VerifiedMobileActor, locationId: string,
  kind: ClockKind, occurredAt: Date, idempotencyKey: string,
  now = new Date()): Promise<string> {
  if (actor.kind !== "employee" || !actor.profileId ||
      actor.locationId !== locationId ||
      !actor.capabilities.has("schedule.own.manage")) {
    throw new AppError("FORBIDDEN", "Employee clock access required", 403);
  }
  if (!idempotencyKey || idempotencyKey.length > 256 ||
      Math.abs(now.getTime() - occurredAt.getTime()) > 5 * 60_000) {
    throw new AppError("BAD_REQUEST", "Clock event outside current time", 400);
  }
  const profileId = actor.profileId;
  return prisma.$transaction(async transaction => {
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${actor.organizationId}),
        hashtext(${actor.profileId}))
    `);
    const prior = await transaction.$queryRaw<{ id: string; kind: string }[]>(Prisma.sql`
      select id, kind from public.staff_attendance_events
      where organization_id = ${actor.organizationId}::uuid
        and profile_id = ${actor.profileId}::uuid
        and idempotency_hash = ${sha256(idempotencyKey)}
    `);
    if (prior[0]) {
      if (prior[0].kind !== kind) throw new AppError("CONFLICT", "Clock key reused", 409);
      return prior[0].id;
    }
    const member = await transaction.location_memberships.findFirst({ where: {
      organization_id: actor.organizationId, location_id: locationId,
      profile_id: profileId, status: "ACTIVE",
    }, select: { id: true } });
    const allLocations = await transaction.organization_memberships.findFirst({ where: {
      organization_id: actor.organizationId, profile_id: profileId,
      status: "ACTIVE", all_locations: true,
    }, select: { id: true } });
    if (!member && !allLocations) throw new AppError("FORBIDDEN", "Store membership inactive", 403);
    const last = await transaction.$queryRaw<{ kind: ClockKind }[]>(Prisma.sql`
      select event.kind from public.staff_attendance_events event
      left join public.staff_attendance_corrections correction on correction.event_id = event.id
      where event.organization_id = ${actor.organizationId}::uuid
        and event.profile_id = ${actor.profileId}::uuid
      order by coalesce(correction.corrected_at, event.occurred_at) desc,
        event.recorded_at desc limit 1
    `);
    const previous = last[0]?.kind ?? null;
    const valid = kind === "CLOCK_IN" ? previous === null || previous === "CLOCK_OUT" :
      kind === "BREAK_START" ? previous === "CLOCK_IN" || previous === "BREAK_END" :
      kind === "BREAK_END" ? previous === "BREAK_START" :
      previous === "CLOCK_IN" || previous === "BREAK_END";
    if (!valid) throw new AppError("CONFLICT", "Invalid clock sequence", 409);
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.staff_attendance_events
        (organization_id, location_id, profile_id, kind, occurred_at,
         device_session_hash, idempotency_hash)
      values (${actor.organizationId}::uuid, ${locationId}::uuid,
        ${actor.profileId}::uuid, ${kind}, ${occurredAt},
        ${sha256(actor.sessionId)}, ${sha256(idempotencyKey)}) returning id
    `);
    return rows[0].id;
  });
}

export async function approveClockCorrection(manager: OrganizationContext,
  eventId: string, correctedAt: Date, reason: string,
  requestId: string): Promise<string> {
  assertCapability(manager, "staff.manage");
  const location = requireLocation(manager);
  if (!reason.trim() || reason.length > 500 || correctedAt > new Date()) {
    throw new AppError("BAD_REQUEST", "Invalid clock correction", 400);
  }
  return prisma.$transaction(async transaction => {
    const events = await transaction.$queryRaw<{ id: string; profileId: string }[]>(Prisma.sql`
      select id, profile_id as "profileId" from public.staff_attendance_events
      where id = ${eventId}::uuid
        and organization_id = ${manager.organization.id}::uuid
        and location_id = ${location.id}::uuid for share
    `);
    if (!events[0]) throw new AppError("NOT_FOUND", "Clock event not found", 404);
    const existing = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.staff_attendance_corrections where event_id = ${eventId}::uuid
    `);
    if (existing[0]) throw new AppError("CONFLICT", "Clock event already corrected", 409);
    const neighbors = await transaction.$queryRaw<{ id: string; at: Date }[]>(Prisma.sql`
      select event.id, coalesce(correction.corrected_at,event.occurred_at) as at
      from public.staff_attendance_events event
      left join public.staff_attendance_corrections correction on correction.event_id=event.id
      where event.organization_id = ${manager.organization.id}::uuid
        and event.profile_id = ${events[0].profileId}::uuid
      order by at, event.recorded_at
    `);
    const index = neighbors.findIndex(row => row.id === eventId);
    if (index < 0 || (index > 0 && correctedAt <= neighbors[index-1].at) ||
        (index < neighbors.length-1 && correctedAt >= neighbors[index+1].at)) {
      throw new AppError("CONFLICT", "Correction changes clock order", 409);
    }
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.staff_attendance_corrections
        (organization_id, event_id, corrected_at, reason, approved_by_profile_id)
      values (${manager.organization.id}::uuid, ${eventId}::uuid,
        ${correctedAt}, ${reason.trim()}, ${manager.session.profileId}::uuid)
      returning id
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: manager.organization.id, location_id: location.id,
      actor_profile_id: manager.session.profileId,
      action: "CLOCK_CORRECTION_APPROVED", target_type: "ATTENDANCE_EVENT",
      target_id: eventId, outcome: "SUCCESS", request_id: requestId,
      after_json: { correctedAt: correctedAt.toISOString(), reason: reason.trim() },
    } });
    return rows[0].id;
  });
}

export async function listAttendanceForContext(context: OrganizationContext,
  profileId: string, from: Date, until: Date): Promise<AttendanceEvent[]> {
  const canReview = hasCapability(context.roles, "staff.read");
  if (!canReview && (context.session.profileId !== profileId ||
      !hasCapability(context.roles, "schedule.own.manage"))) {
    throw new AppError("FORBIDDEN", "Attendance access denied", 403);
  }
  const location = requireLocation(context);
  return prisma.$queryRaw<AttendanceEvent[]>(Prisma.sql`
    select event.id, event.location_id as "locationId", event.kind,
      event.occurred_at as "occurredAt", correction.corrected_at as "correctedAt"
    from public.staff_attendance_events event
    left join public.staff_attendance_corrections correction on correction.event_id = event.id
    where event.organization_id = ${context.organization.id}::uuid
      and event.location_id = ${location.id}::uuid
      and event.profile_id = ${profileId}::uuid
      and coalesce(correction.corrected_at,event.occurred_at) >= ${from}
      and coalesce(correction.corrected_at,event.occurred_at) < ${until}
    order by coalesce(correction.corrected_at,event.occurred_at),event.recorded_at
  `);
}

export async function listAttendanceAcrossOrganization(context: OrganizationContext,
  profileId: string, from: Date, until: Date): Promise<AttendanceEvent[]> {
  const canReview = hasCapability(context.roles, "staff.read");
  if (!canReview && (context.session.profileId !== profileId ||
      !hasCapability(context.roles, "schedule.own.manage"))) {
    throw new AppError("FORBIDDEN", "Attendance access denied", 403);
  }
  const locationIds = [...context.accessibleLocationIds];
  if (!locationIds.length) return [];
  return prisma.$queryRaw<AttendanceEvent[]>(Prisma.sql`
    select event.id, event.location_id as "locationId", event.kind,
      event.occurred_at as "occurredAt", correction.corrected_at as "correctedAt"
    from public.staff_attendance_events event
    left join public.staff_attendance_corrections correction on correction.event_id = event.id
    where event.organization_id = ${context.organization.id}::uuid
      and event.location_id = any(${locationIds}::uuid[])
      and event.profile_id = ${profileId}::uuid
      and coalesce(correction.corrected_at,event.occurred_at) >= ${from}
      and coalesce(correction.corrected_at,event.occurred_at) < ${until}
    order by coalesce(correction.corrected_at,event.occurred_at),event.recorded_at
  `);
}

export function summarizeAttendance(events: readonly AttendanceEvent[], timezone: string,
  standardMinutes = 480): { workedMinutes: number; breakMinutes: number;
    overtimeUnapprovedMinutes: number; overnight: boolean; incomplete: boolean } {
  let workingFrom: Date | null = null, breakFrom: Date | null = null;
  let worked = 0, breaks = 0, overnight = false;
  for (const event of [...events].sort((a,b) =>
    (a.correctedAt ?? a.occurredAt).getTime() - (b.correctedAt ?? b.occurredAt).getTime())) {
    const at = event.correctedAt ?? event.occurredAt;
    if (event.kind === "CLOCK_IN") workingFrom = at;
    if (event.kind === "BREAK_START" && workingFrom) {
      worked += at.getTime() - workingFrom.getTime(); workingFrom = null; breakFrom = at;
    }
    if (event.kind === "BREAK_END" && breakFrom) {
      breaks += at.getTime() - breakFrom.getTime(); breakFrom = null; workingFrom = at;
    }
    if (event.kind === "CLOCK_OUT" && workingFrom) {
      worked += at.getTime() - workingFrom.getTime(); workingFrom = null;
    }
    if (event.kind === "CLOCK_OUT" && events[0]) {
      overnight ||= formatDateInTimeZone(events[0].correctedAt ?? events[0].occurredAt,
        timezone) !== formatDateInTimeZone(at, timezone);
    }
  }
  const workedMinutes = Math.floor(worked / 60_000);
  return { workedMinutes, breakMinutes: Math.floor(breaks / 60_000),
    overtimeUnapprovedMinutes: Math.max(0, workedMinutes - standardMinutes),
    overnight, incomplete: Boolean(workingFrom || breakFrom) };
}
