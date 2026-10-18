import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { findQualificationReviews } from "../booking/qualification-review";

export type StaffServiceChannel = "ONLINE" | "WALK_IN" | "MANUAL";

export async function isStaffQualified(locationId: string, staffProfileId: string,
  serviceVariantId: string, at: Date, channel: StaffServiceChannel): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ qualified: boolean }[]>(Prisma.sql`
    select exists (
      select 1 from public.location_services service
      join public.service_staff_assignments assignment
        on assignment.organization_id = service.organization_id
       and assignment.location_service_id = service.id
      join public.staff_profiles staff
        on staff.organization_id = service.organization_id
       and staff.id = assignment.staff_profile_id
      where service.location_id = ${locationId}::uuid
        and service.service_variant_id = ${serviceVariantId}::uuid
        and service.is_active and assignment.is_active and staff.is_active
        and assignment.staff_profile_id = ${staffProfileId}::uuid
        and assignment.effective_from <= ${at}
        and (assignment.effective_until is null or assignment.effective_until > ${at})
        and (${channel} <> 'ONLINE' or
          (service.online_booking_enabled and assignment.online_booking_enabled))
        and (${channel} <> 'WALK_IN' or assignment.walk_in_eligible)
    ) as qualified
  `);
  return rows[0]?.qualified ?? false;
}

export async function setStaffCapability(input: {
  context: OrganizationContext;
  assignmentId: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  onlineSelectable: boolean;
  walkInEligible: boolean;
  reason: string;
}): Promise<{ pendingReviewCount: number }> {
  if (!input.context.roles.has("FRONT_DESK")) {
    assertCapability(input.context, "team.manage");
  }
  const location = requireLocation(input.context);
  if (input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) {
    throw new AppError("BAD_REQUEST", "Invalid effective period", 400);
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new AppError("BAD_REQUEST", "Reason required", 400);
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select assignment.id from public.service_staff_assignments assignment
      join public.location_services service
        on service.id = assignment.location_service_id
       and service.organization_id = assignment.organization_id
      where assignment.id = ${input.assignmentId}::uuid
        and assignment.organization_id = ${input.context.organization.id}::uuid
        and service.location_id = ${location.id}::uuid
      for update of assignment
    `);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Staff service assignment not found", 404);
    await transaction.$executeRaw(Prisma.sql`
      update public.service_staff_assignments
      set effective_from = ${input.effectiveFrom},
        effective_until = ${input.effectiveUntil},
        online_booking_enabled = ${input.onlineSelectable},
        walk_in_eligible = ${input.walkInEligible}, updated_at = now()
      where id = ${input.assignmentId}::uuid
    `);
    await transaction.$executeRaw(Prisma.sql`
      insert into public.staff_capability_events
        (organization_id, location_id, assignment_id, actor_profile_id,
         effective_from, effective_until, online_booking_enabled,
         walk_in_eligible, reason)
      values (${input.context.organization.id}::uuid, ${location.id}::uuid,
        ${input.assignmentId}::uuid, ${input.context.session.profileId}::uuid,
        ${input.effectiveFrom}, ${input.effectiveUntil},
        ${input.onlineSelectable}, ${input.walkInEligible}, ${reason})
    `);
    const reviews = await findQualificationReviews(transaction, input.context,
      { assignmentId: input.assignmentId });
    return { pendingReviewCount: reviews.total };
  });
}
