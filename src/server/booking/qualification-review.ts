import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";

type ReviewRow = { segmentId: string; bookingId: string; bookingVersion: number;
  staffId: string; staffName: string; serviceName: string; startsAt: Date;
  total: number; canReassign: boolean };
type PageRow = { [Key in keyof ReviewRow]: ReviewRow[Key] | null } & { total: number };

// Derive work from current persisted terms, not a second queue that can miss concurrent
// confirmations or retain cancelled/reassigned/restored bookings.
export async function findQualificationReviews(transaction: Prisma.TransactionClient,
  context: OrganizationContext, options: { assignmentId?: string; offset?: number } = {}) {
  const location = requireLocation(context);
  const rows = await transaction.$queryRaw<PageRow[]>(Prisma.sql`
    with pending as (
    select segment.id as "segmentId", booking.id as "bookingId",
      booking.version as "bookingVersion", segment.assigned_staff_id as "staffId",
      coalesce(segment.staff_name_snapshot, '') as "staffName",
      segment.service_name_snapshot as "serviceName", segment.starts_at as "startsAt",
      ((select count(*) from public.booking_segments part where part.booking_id = booking.id) = 1
        and (select count(*) from public.booking_staff_allocations allocation
          where allocation.booking_id = booking.id and allocation.is_blocking) = 1) as "canReassign"
    from public.booking_segments segment
    join public.bookings booking on booking.id = segment.booking_id
      and booking.organization_id = segment.organization_id and booking.location_id = segment.location_id
    join public.location_services service on service.organization_id = segment.organization_id
      and service.location_id = segment.location_id and service.service_variant_id = segment.service_variant_id
    join public.service_staff_assignments assignment on assignment.organization_id = service.organization_id
      and assignment.location_service_id = service.id and assignment.staff_profile_id = segment.assigned_staff_id
    where segment.organization_id = ${context.organization.id}::uuid
      and segment.location_id = ${location.id}::uuid
      and segment.starts_at > now() and booking.service_started_at is null
      and booking.status in ('CONFIRMED', 'PENDING_PAYMENT')
      and (assignment.effective_from > segment.starts_at
        or assignment.effective_until <= segment.starts_at or not assignment.is_active)
      and exists (select 1 from public.staff_capability_events event
        where event.assignment_id = assignment.id and event.organization_id = segment.organization_id
          and event.location_id = segment.location_id)
      ${options.assignmentId ? Prisma.sql`and assignment.id = ${options.assignmentId}::uuid` : Prisma.empty}
    )
    select page.*, totals.total from (select count(*)::integer as total from pending) totals
    left join lateral (select * from pending order by "startsAt", "segmentId"
      limit 50 offset ${options.offset ?? 0}) page on true
    order by page."startsAt", page."segmentId"
  `);
  // A null primary key is the count-only row for an empty page; real rows have all selected fields.
  const items = rows.filter((row): row is ReviewRow => row.segmentId !== null);
  return { items: items.map(row => ({ segmentId: row.segmentId, bookingId: row.bookingId,
    bookingVersion: row.bookingVersion, staffId: row.staffId, staffName: row.staffName,
    serviceName: row.serviceName, startsAt: row.startsAt.toISOString(), canReassign: row.canReassign })),
    total: rows[0]?.total ?? 0, timezone: location.timezone };
}

export async function listQualificationReviews(context: OrganizationContext, offset = 0) {
  assertCapability(context, "booking.manage");
  return findQualificationReviews(prisma, context, { offset });
}
