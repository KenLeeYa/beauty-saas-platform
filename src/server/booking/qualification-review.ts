import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";

type ReviewRow = { segmentId: string; bookingId: string; bookingVersion: number;
  allocationId: string | null;
  staffId: string; staffName: string; serviceName: string; startsAt: Date;
  total: number; canReassign: boolean };
type PageRow = { [Key in keyof ReviewRow]: ReviewRow[Key] | null } & { total: number };

// Derive work from current persisted terms, not a second queue that can miss concurrent
// confirmations or retain cancelled/reassigned/restored bookings.
export async function findQualificationReviews(transaction: Prisma.TransactionClient,
  context: OrganizationContext, options: { assignmentId?: string; offset?: number; limit?: number; search?: string } = {}) {
  const location = requireLocation(context);
  const rows = await transaction.$queryRaw<PageRow[]>(Prisma.sql`
    with pending as (
    select segment.id as "segmentId", booking.id as "bookingId",
      booking.version as "bookingVersion", participant.staff_id as "staffId",
      participant.allocation_id as "allocationId", staff.display_name as "staffName",
      segment.service_name_snapshot as "serviceName", segment.starts_at as "startsAt",
      (participant.allocation_id is not null) as "canReassign"
    from public.booking_segments segment
    join public.bookings booking on booking.id = segment.booking_id
      and booking.organization_id = segment.organization_id and booking.location_id = segment.location_id
    join lateral (
      select allocation.id as allocation_id, allocation.staff_profile_id as staff_id
      from public.booking_staff_allocations allocation
      where allocation.booking_id = booking.id and allocation.booking_segment_id = segment.id
        and allocation.organization_id = segment.organization_id and allocation.location_id = segment.location_id
        and allocation.is_blocking
      union all
      select null::uuid, segment.assigned_staff_id where segment.assigned_staff_id is not null
        and not exists (select 1 from public.booking_staff_allocations allocation
          where allocation.booking_id = booking.id and allocation.booking_segment_id = segment.id
            and allocation.organization_id = segment.organization_id and allocation.location_id = segment.location_id
            and allocation.is_blocking and allocation.staff_profile_id = segment.assigned_staff_id)
    ) participant on true
    join public.staff_profiles staff on staff.id = participant.staff_id and staff.organization_id = segment.organization_id
    join public.location_services service on service.organization_id = segment.organization_id
      and service.location_id = segment.location_id and service.service_variant_id = segment.service_variant_id
    join public.service_staff_assignments assignment on assignment.organization_id = service.organization_id
      and assignment.location_service_id = service.id and assignment.staff_profile_id = participant.staff_id
    where segment.organization_id = ${context.organization.id}::uuid
      and segment.location_id = ${location.id}::uuid
      and segment.starts_at > now() and booking.service_started_at is null
      and booking.status in ('CONFIRMED', 'PENDING_PAYMENT')
      and (assignment.effective_from > segment.starts_at
        or assignment.effective_until <= segment.starts_at or not assignment.is_active
        or not (service.required_skills <@ staff.skills))
      and exists (select 1 from public.staff_capability_events event
        where event.assignment_id = assignment.id and event.organization_id = segment.organization_id
          and event.location_id = segment.location_id)
      ${options.assignmentId ? Prisma.sql`and assignment.id = ${options.assignmentId}::uuid` : Prisma.empty}
      ${options.search?.trim() ? Prisma.sql`and (strpos(lower(staff.display_name), lower(${options.search.trim()})) > 0
        or strpos(lower(segment.service_name_snapshot), lower(${options.search.trim()})) > 0)` : Prisma.empty}
    )
    select page.*, totals.total from (select count(*)::integer as total from pending) totals
    left join lateral (select * from pending order by "startsAt", "segmentId", "staffId", "allocationId"
      limit ${Math.min(50, Math.max(1, options.limit ?? 50))} offset ${options.offset ?? 0}) page on true
    order by page."startsAt", page."segmentId", page."staffId", page."allocationId"
  `);
  // A null primary key is the count-only row for an empty page; real rows have all selected fields.
  const items = rows.filter((row): row is ReviewRow => row.segmentId !== null);
  const arrangements = items.length ? await transaction.booking_segments.findMany({ where: {
    organization_id: context.organization.id, location_id: location.id,
    booking_id: { in: [...new Set(items.map(row => row.bookingId))] },
  }, orderBy: { sort_order: "asc" }, select: { id: true, booking_id: true,
    service_name_snapshot: true, starts_at: true, ends_at: true, assigned_staff_id: true, staff_name_snapshot: true,
    booking_staff_allocations: { where: { is_blocking: true, organization_id: context.organization.id,
      location_id: location.id }, select: { id: true, booking_id: true, staff_profile_id: true,
      staff_profiles: { select: { display_name: true } } } },
  } }) : [];
  return { items: items.map(row => ({ segmentId: row.segmentId, bookingId: row.bookingId,
    allocationId: row.allocationId,
    bookingVersion: row.bookingVersion, staffId: row.staffId, staffName: row.staffName,
    serviceName: row.serviceName, startsAt: row.startsAt.toISOString(), canReassign: row.canReassign,
    arrangements: arrangements.filter(part => part.booking_id === row.bookingId).map(part => ({
      segmentId: part.id, serviceName: part.service_name_snapshot,
      startsAt: part.starts_at.toISOString(), endsAt: part.ends_at.toISOString(),
      staff: [
        ...part.booking_staff_allocations.filter(allocation => allocation.booking_id === row.bookingId)
          .map(allocation => ({ allocationId: allocation.id as string | null, staffId: allocation.staff_profile_id,
            name: allocation.staff_profiles.display_name })),
        ...(part.assigned_staff_id && !part.booking_staff_allocations.some(allocation =>
          allocation.booking_id === row.bookingId && allocation.staff_profile_id === part.assigned_staff_id)
          ? [{ allocationId: null, staffId: part.assigned_staff_id, name: part.staff_name_snapshot ?? "" }] : []),
      ],
    })),
  })),
    total: rows[0]?.total ?? 0, timezone: location.timezone };
}

export async function listQualificationReviews(context: OrganizationContext, offset = 0, options: {limit?: number; search?: string} = {}) {
  assertCapability(context, "booking.manage");
  return findQualificationReviews(prisma, context, { ...options, offset });
}
