import "server-only";

import { Prisma } from "@prisma/client";
import type { VerifiedMobileActor } from "../auth/line-mobile-session";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

function requireReception(actor: VerifiedMobileActor): string {
  if (actor.kind !== "employee" || !actor.profileId ||
      !actor.capabilities.has("booking.manage"))
    throw new AppError("FORBIDDEN","Reception queue denied",403);
  return actor.profileId;
}

export type ExceptionItem = { id: string; kind: "FAILED_DISPATCH" | "PENDING_PAYMENT";
  startsAt: string; serviceName: string; staffName: string;
  bookingId: string | null };

export async function listBookingExceptions(actor: VerifiedMobileActor):
  Promise<ExceptionItem[]> {
  requireReception(actor);
  const [failed,pending] = await Promise.all([
    prisma.$queryRaw<Array<{ id:string; startsAt:Date; serviceName:string;
      staffName:string }>>(Prisma.sql`
      select claim.id,claim.starts_at as "startsAt",
        variant.name as "serviceName",staff.display_name as "staffName"
      from public.booking_dispatch_claims claim
      join public.service_variants variant on variant.id=claim.service_variant_id
        and variant.organization_id=claim.organization_id
      join public.staff_profiles staff on staff.id=claim.staff_profile_id
        and staff.organization_id=claim.organization_id
      where claim.organization_id=${actor.organizationId}::uuid
        and claim.location_id=${actor.locationId}::uuid
        and claim.status='FAILED' and claim.created_at>=now()-interval '7 days'
        and not exists (select 1 from public.booking_dispatch_exception_reviews review
          where review.claim_id=claim.id)
      order by claim.created_at desc limit 30
    `),
    prisma.$queryRaw<Array<{ id:string; startsAt:Date; serviceName:string;
      staffName:string }>>(Prisma.sql`
      select booking.id,segment.starts_at as "startsAt",
        segment.service_name_snapshot as "serviceName",
        coalesce(segment.staff_name_snapshot,'') as "staffName"
      from public.bookings booking join public.booking_segments segment
        on segment.booking_id=booking.id and segment.organization_id=booking.organization_id
      where booking.organization_id=${actor.organizationId}::uuid
        and booking.location_id=${actor.locationId}::uuid
        and booking.status='PENDING_PAYMENT' and segment.starts_at>=now()
      order by segment.starts_at limit 30
    `),
  ]);
  return [...failed.map(row => ({ id:row.id,kind:"FAILED_DISPATCH" as const,
    startsAt:row.startsAt.toISOString(),serviceName:row.serviceName,
    staffName:row.staffName,bookingId:null })),
  ...pending.map(row => ({ id:row.id,kind:"PENDING_PAYMENT" as const,
    startsAt:row.startsAt.toISOString(),serviceName:row.serviceName,
    staffName:row.staffName,bookingId:row.id }))];
}

export async function acknowledgeDispatchException(actor: VerifiedMobileActor,
  claimId: string, reason: string, requestId: string): Promise<void> {
  const profileId = requireReception(actor);
  if (!reason.trim() || reason.length > 500)
    throw new AppError("BAD_REQUEST","Review reason required",400);
  await prisma.$transaction(async transaction => {
    const claim = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.booking_dispatch_claims
      where id=${claimId}::uuid and organization_id=${actor.organizationId}::uuid
        and location_id=${actor.locationId}::uuid and status='FAILED' for update
    `);
    if (!claim[0]) throw new AppError("NOT_FOUND","Failed dispatch not found",404);
    const inserted=await transaction.$queryRaw<{ claimId:string }[]>(Prisma.sql`
      insert into public.booking_dispatch_exception_reviews
        (claim_id,organization_id,location_id,reviewed_by_profile_id,reason)
      values (${claimId}::uuid,${actor.organizationId}::uuid,
        ${actor.locationId}::uuid,${profileId}::uuid,${reason.trim()})
      on conflict (claim_id) do nothing
      returning claim_id as "claimId"
    `);
    if (!inserted[0]) {
      const prior=await transaction.$queryRaw<{ reason:string }[]>(Prisma.sql`
        select reason from public.booking_dispatch_exception_reviews
        where claim_id=${claimId}::uuid
      `);
      if (prior[0]?.reason !== reason.trim()) throw new AppError("CONFLICT",
        "Dispatch exception was already reviewed",409);
      return;
    }
    await transaction.audit_logs.create({ data: {
      organization_id: actor.organizationId, location_id: actor.locationId,
      actor_profile_id: profileId, action:"DISPATCH_EXCEPTION_REVIEWED",
      target_type:"DISPATCH_CLAIM",target_id:claimId,
      outcome:"SUCCESS",request_id:requestId,
      after_json:{ reason:reason.trim() },
    } });
  });
}
