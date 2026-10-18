import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { formatDateInTimeZone, localDayOfWeek } from "../time/timezone";

export async function listAtRiskFutureBookings(context: OrganizationContext,
  staffId: string, from = new Date()): Promise<Array<{ id: string; startsAt: string;
    serviceName: string; staffName: string }>> {
  assertCapability(context, "booking.manage");
  const location = requireLocation(context);
  const rows = await prisma.booking_segments.findMany({ where: {
    organization_id: context.organization.id, location_id: location.id,
    assigned_staff_id: staffId, starts_at: { gte: from },
    bookings: { status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
  }, orderBy: { starts_at: "asc" }, take: 100,
  select: { booking_id: true, starts_at: true, service_name_snapshot: true,
    staff_name_snapshot: true } });
  return rows.map(row => ({ id: row.booking_id, startsAt: row.starts_at.toISOString(),
    serviceName: row.service_name_snapshot, staffName: row.staff_name_snapshot ?? "" }));
}

function localClock(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone,
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
}

export async function reassignFutureBooking(input: { context: OrganizationContext;
  bookingId: string; targetStaffId: string; reason: string; requestId: string;
  expectedVersion?: number; segmentId?: string; allocationId?: string }): Promise<void> {
  assertCapability(input.context, "booking.manage");
  const location = requireLocation(input.context);
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new AppError("BAD_REQUEST", "Reason required", 400);
  const precise = input.segmentId !== undefined || input.allocationId !== undefined;
  if (precise && (!input.segmentId || !input.allocationId || !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion! < 1)) {
    throw new AppError("BAD_REQUEST", "Segment, allocation and version are required together", 400);
  }
  await prisma.$transaction(async transaction => {
    const locked = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.bookings
      where id = ${input.bookingId}::uuid
        and organization_id = ${input.context.organization.id}::uuid
        and location_id = ${location.id}::uuid
      for update
    `);
    if (!locked[0]) throw new AppError("NOT_FOUND", "Booking not found", 404);
    const booking = await transaction.bookings.findUniqueOrThrow({ where: { id: input.bookingId },
      select: { status: true, version: true, customer_id: true, service_started_at: true,
        booking_segments: { where: { organization_id: input.context.organization.id, location_id: location.id }, orderBy: { sort_order: "asc" }, select: {
          id: true, assigned_staff_id: true, starts_at: true, ends_at: true,
          service_variant_id: true, pre_buffer_minutes: true,
          post_buffer_minutes: true,
        } }, booking_staff_allocations: { where: { is_blocking: true,
          organization_id: input.context.organization.id, location_id: location.id }, select: {
          id: true, staff_profile_id: true, starts_at: true, ends_at: true,
          booking_segment_id: true,
        } } } });
    const segment = precise ? booking.booking_segments.find(row => row.id === input.segmentId) : booking.booking_segments[0];
    if (input.expectedVersion !== undefined && booking.version !== input.expectedVersion) {
      throw new AppError("CONFLICT", "Booking changed; refresh before reassignment", 409);
    }
    const old = precise ? booking.booking_staff_allocations.find(row => row.id === input.allocationId) : booking.booking_staff_allocations[0];
    if (!["CONFIRMED", "PENDING_PAYMENT"].includes(booking.status) || booking.service_started_at ||
        (!precise && (booking.booking_segments.length !== 1 || booking.booking_staff_allocations.length !== 1)) ||
        !segment || !old || old.booking_segment_id !== segment.id ||
        segment.starts_at <= new Date() || !segment.service_variant_id) {
      throw new AppError("CONFLICT", "Booking cannot be reassigned", 409);
    }
    if (old.staff_profile_id === input.targetStaffId) return;
    if (segment.assigned_staff_id === input.targetStaffId || booking.booking_staff_allocations.some(row =>
      row.booking_segment_id === segment.id && row.staff_profile_id === input.targetStaffId)) {
      throw new AppError("CONFLICT", "Target already participates in this service", 409);
    }
    const target = await transaction.staff_profiles.findFirst({ where: {
      id: input.targetStaffId, organization_id: input.context.organization.id,
      is_active: true, staff_location_assignments: { some: {
        location_id: location.id, is_active: true } },
    }, select: { id: true, display_name: true } });
    if (!target) throw new AppError("NOT_FOUND", "Target staff unavailable", 404);
    const day = formatDateInTimeZone(segment.starts_at, location.timezone);
    const starts = localClock(segment.starts_at, location.timezone);
    const ends = localClock(segment.ends_at, location.timezone);
    const weekday = localDayOfWeek(day);
    const qualified = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select assignment.id from public.service_staff_assignments assignment
      join public.location_services service
        on service.id = assignment.location_service_id
       and service.organization_id = assignment.organization_id
      where service.organization_id = ${input.context.organization.id}::uuid
        and service.location_id = ${location.id}::uuid
        and service.service_variant_id = ${segment.service_variant_id}::uuid
        and assignment.staff_profile_id = ${target.id}::uuid
        and service.is_active and assignment.is_active
        and assignment.effective_from <= ${segment.starts_at}
        and (assignment.effective_until is null or assignment.effective_until > ${segment.starts_at})
      for share of assignment
    `);
    if (!qualified[0]) throw new AppError("CONFLICT", "Target is not qualified", 409);
    const schedule = await transaction.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
      select (
        exists (select 1 from public.staff_schedule_exceptions exception
          where exception.organization_id = ${input.context.organization.id}::uuid
            and exception.location_id = ${location.id}::uuid
            and exception.staff_profile_id = ${target.id}::uuid
            and exception.exception_date = ${day}::date
            and exception.kind = 'AVAILABLE'
            and (exception.starts_at is null or exception.starts_at <= ${starts}::time)
            and (exception.ends_at is null or exception.ends_at >= ${ends}::time))
        or (not exists (select 1 from public.staff_schedule_exceptions exception
          where exception.organization_id = ${input.context.organization.id}::uuid
            and exception.location_id = ${location.id}::uuid
            and exception.staff_profile_id = ${target.id}::uuid
            and exception.exception_date = ${day}::date and exception.kind = 'AVAILABLE')
          and exists (select 1 from public.staff_availability_rules rule
            where rule.organization_id = ${input.context.organization.id}::uuid
              and rule.location_id = ${location.id}::uuid
              and rule.staff_profile_id = ${target.id}::uuid
              and rule.day_of_week = ${weekday} and rule.is_active
              and (rule.effective_from is null or rule.effective_from <= ${day}::date)
              and (rule.effective_until is null or rule.effective_until >= ${day}::date)
              and rule.starts_at <= ${starts}::time and rule.ends_at >= ${ends}::time))
      ) and not exists (select 1 from public.staff_schedule_exceptions exception
        where exception.organization_id = ${input.context.organization.id}::uuid
          and exception.location_id = ${location.id}::uuid
          and exception.staff_profile_id = ${target.id}::uuid
          and exception.exception_date = ${day}::date
          and exception.kind = 'UNAVAILABLE'
          and (exception.starts_at is null or exception.starts_at < ${ends}::time)
          and (exception.ends_at is null or exception.ends_at > ${starts}::time))
        and not exists (select 1 from public.staff_time_off off
          where off.organization_id = ${input.context.organization.id}::uuid
            and off.staff_profile_id = ${target.id}::uuid
            and (off.location_id is null or off.location_id = ${location.id}::uuid)
            and off.starts_at < ${old.ends_at} and off.ends_at > ${old.starts_at})
        as allowed
    `);
    if (!schedule[0]?.allowed) throw new AppError("CONFLICT", "Target is off shift", 409);
    const priorDispatch = await transaction.$queryRaw<{ id: string; mode: string }[]>(Prisma.sql`
      select claim.id, claim.mode from public.booking_dispatch_claims claim
      where claim.organization_id = ${input.context.organization.id}::uuid
        and claim.location_id = ${location.id}::uuid
        and claim.booking_id = ${input.bookingId}::uuid and claim.status = 'CONFIRMED'
        and claim.service_variant_id = ${segment.service_variant_id}::uuid
        and claim.starts_at = ${segment.starts_at}
        and (claim.staff_profile_id = ${old.staff_profile_id}::uuid or exists (
          select 1 from public.booking_dispatch_events event where event.claim_id = claim.id
            and event.event_type = 'REASSIGNED' and event.staff_profile_id = ${old.staff_profile_id}::uuid))
      for update of claim
    `);
    if (priorDispatch.length > 1) throw new AppError("CONFLICT", "Ambiguous dispatch assignment", 409);
    if (priorDispatch[0]) {
      if (priorDispatch[0].mode === "IMMEDIATE" &&
          !input.context.roles.has("ORGANIZATION_OWNER")) {
        throw new AppError("FORBIDDEN", "Immediate rotation override requires owner access", 403);
      }
      const changes = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        select id from public.booking_dispatch_events
        where claim_id = ${priorDispatch[0].id}::uuid and event_type = 'REASSIGNED'
      `);
      if (changes.length) throw new AppError("CONFLICT", "Dispatch booking already reassigned", 409);
    }
    // Inserting the new blocking allocation first lets the GiST exclusion reject a busy target.
    const replacement = await transaction.booking_staff_allocations.create({ data: {
      organization_id: input.context.organization.id, location_id: location.id,
      booking_id: input.bookingId, booking_segment_id: segment.id,
      staff_profile_id: target.id, starts_at: old.starts_at, ends_at: old.ends_at,
    } });
    await transaction.booking_staff_allocations.delete({ where: { id: old.id } });
    if (segment.assigned_staff_id === old.staff_profile_id) {
      await transaction.booking_segments.update({ where: { id: segment.id }, data: {
        assigned_staff_id: target.id, staff_name_snapshot: target.display_name,
      } });
    }
    await transaction.bookings.update({ where: { id: input.bookingId },
      data: { version: { increment: 1 } } });
    await transaction.booking_events.create({ data: {
      organization_id: input.context.organization.id, location_id: location.id,
      booking_id: input.bookingId, event_type: "STAFF_REASSIGNED",
      actor_profile_id: input.context.session.profileId, reason_code: "STAFF_CHANGE",
      metadata: { oldStaffId: old.staff_profile_id, newStaffId: target.id,
        segmentId: segment.id, oldAllocationId: old.id, newAllocationId: replacement.id,
        reason, requestId: input.requestId },
    } });
    if (priorDispatch[0]) {
      if (priorDispatch[0].mode === "IMMEDIATE") {
        await transaction.$executeRaw(Prisma.sql`
          insert into public.booking_dispatch_events
            (organization_id, location_id, claim_id, booking_id,
             staff_profile_id, event_type, reason)
          values (${input.context.organization.id}::uuid, ${location.id}::uuid,
            ${priorDispatch[0].id}::uuid, ${input.bookingId}::uuid,
            ${old.staff_profile_id}::uuid, 'PRESTART_COMPENSATED', ${reason})
        `);
      }
      await transaction.$executeRaw(Prisma.sql`
        insert into public.booking_dispatch_events
          (organization_id, location_id, claim_id, booking_id,
           staff_profile_id, event_type, reason)
        values (${input.context.organization.id}::uuid, ${location.id}::uuid,
          ${priorDispatch[0].id}::uuid, ${input.bookingId}::uuid,
          ${target.id}::uuid, 'REASSIGNED', ${reason})
      `);
      if (priorDispatch[0].mode === "IMMEDIATE") {
        await transaction.$executeRaw(Prisma.sql`
          insert into public.booking_dispatch_events
            (organization_id, location_id, claim_id, booking_id,
             staff_profile_id, event_type, reason)
          values (${input.context.organization.id}::uuid, ${location.id}::uuid,
            ${priorDispatch[0].id}::uuid, ${input.bookingId}::uuid,
            ${target.id}::uuid, 'OVERRIDE', ${reason})
        `);
      }
    }
    await transaction.notification_outbox.create({ data: {
      organization_id: input.context.organization.id, location_id: location.id,
      booking_id: input.bookingId, customer_id: booking.customer_id,
      event_type: "BOOKING_RESCHEDULED",
      payload: { bookingId: input.bookingId, segmentId: segment.id, staffId: target.id,
        startsAt: segment.starts_at.toISOString(), reason: "staff changed" },
      idempotency_key: `booking:${input.bookingId}:reassignment:${booking.version + 1}`,
    } });
  });
}
