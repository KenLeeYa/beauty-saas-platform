import "server-only";

import { Prisma } from "@prisma/client";
import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { loadPublishedCommissionRules, quoteCommission } from "./commission-quote";
import { allocateProviderPool } from "./allocation-math";

export type AllocationInput = { context: OrganizationContext; bookingSegmentId: string;
  method: "PERCENT" | "FIXED"; lines: Array<{ staffProfileId: string;
    shareBps?: number; fixedMinor?: number }>; expectedVersion?: number;
  requestId: string };
type Segment = { id: string; bookingId: string; bookingVersion: number;
  completedAt: Date; serviceVariantId: string; primaryStaffId: string;
  priceMinor: number; bookingTotalMinor: number; bonusMinor: bigint;
  siblings: Array<{ id: string; priceMinor: number }> };
export type AllocationPreview = { bookingSegmentId: string; bookingVersion: number;
  version: number; method: "PERCENT" | "FIXED"; segmentPriceMinor: number;
  commissionPoolMinor: number; lines: Array<{ staffProfileId: string;
    shareBps: number | null; quotedMinor: number }> };

function localOnly(): void {
  if (process.env.APP_ENV !== "test" || process.env.PAYROLL_TEST_ONLY !== "true")
    throw new AppError("FEATURE_UNAVAILABLE", "Financial allocation is not activated", 503);
}

async function prepare(input: AllocationInput, client: Prisma.TransactionClient):
  Promise<AllocationPreview> {
  const location = requireLocation(input.context);
  const rows = await client.$queryRaw<Segment[]>(Prisma.sql`
    select segment.id, booking.id as "bookingId", booking.version as "bookingVersion",
      booking.completed_at as "completedAt",
      segment.service_variant_id as "serviceVariantId",
      segment.assigned_staff_id as "primaryStaffId",
      segment.price_minor as "priceMinor", booking.total_minor as "bookingTotalMinor",
      coalesce((select sum(wallet.bonus_minor) from public.member_wallet_transactions wallet
        where wallet.booking_id=booking.id and wallet.kind='REDEMPTION'),0)::bigint
        as "bonusMinor",
      (select json_agg(json_build_object('id',sibling.id,'priceMinor',sibling.price_minor)
        order by sibling.sort_order,sibling.id) from public.booking_segments sibling
        where sibling.booking_id=booking.id) as siblings
    from public.booking_segments segment join public.bookings booking
      on booking.id=segment.booking_id and booking.organization_id=segment.organization_id
    where segment.id=${input.bookingSegmentId}::uuid
      and segment.organization_id=${input.context.organization.id}::uuid
      and segment.location_id=${location.id}::uuid and booking.status='COMPLETED'
    for update of segment
  `);
  const segment = rows[0];
  if (!segment?.completedAt || !segment.serviceVariantId)
    throw new AppError("NOT_FOUND", "Completed segment not found", 404);
  const providers = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    select distinct staff_profile_id as id from public.booking_staff_allocations
    where organization_id=${input.context.organization.id}::uuid
      and location_id=${location.id}::uuid
      and booking_segment_id=${input.bookingSegmentId}::uuid
    union select ${segment.primaryStaffId}::uuid as id
  `);
  const ids = providers.map(row => row.id).sort();
  if (ids.length < 2 || ids.join() !== input.lines.map(line => line.staffProfileId).sort().join())
    throw new AppError("BAD_REQUEST", "Allocation must include each assigned provider", 400);
  const total = segment.siblings.reduce((sum,row) => sum+row.priceMinor,0);
  if (!total || segment.siblings.some(row => row.priceMinor < 0))
    throw new AppError("CONFLICT", "Invalid segment price source", 409);
  const index = segment.siblings.findIndex(row => row.id === segment.id);
  if (index < 0) throw new AppError("CONFLICT", "Invalid segment source", 409);
  const split = (amount: number) => index === segment.siblings.length-1 ? amount -
    segment.siblings.slice(0,-1).reduce((sum,row) =>
      sum+Math.floor(amount*row.priceMinor/total),0) :
    Math.floor(amount*segment.siblings[index].priceMinor/total);
  const discounted = split(segment.bookingTotalMinor);
  const bonus = Math.min(discounted,split(Number(segment.bonusMinor)));
  if (discounted < 0 || discounted > segment.priceMinor)
    throw new AppError("CONFLICT", "Invalid discounted segment price", 409);
  const rules = await loadPublishedCommissionRules(input.context.organization.id,segment.completedAt);
  const quote = quoteCommission([{ id: segment.id,
    organizationId: input.context.organization.id, locationId: location.id,
    serviceVariantId: segment.serviceVariantId,
    staffProfileIds: [segment.primaryStaffId], listPriceMinor: segment.priceMinor,
    discountedPriceMinor: discounted, paymentFeeMinor: 0, taxMinor: 0,
    completedAt: segment.completedAt }], { paidMinor: discounted-bonus,
    bonusMinor: bonus }, rules)[0];
  if (!quote) throw new AppError("CONFLICT", "Published commission rule required", 409);
  const versionRows = await client.$queryRaw<{ version: number }[]>(Prisma.sql`
    select coalesce(max(version),0)::int as version
    from public.commission_segment_allocation_sets
    where organization_id=${input.context.organization.id}::uuid
      and booking_segment_id=${segment.id}::uuid
  `);
  const version = versionRows[0].version;
  if (input.expectedVersion !== undefined && input.expectedVersion !== version)
    throw new AppError("CONFLICT", "Allocation version changed", 409);
  let lines;
  try { lines = allocateProviderPool(quote.commissionMinor,input.method,input.lines); }
  catch (error) { throw new AppError("BAD_REQUEST",
    error instanceof Error ? error.message : "Invalid provider allocation",400); }
  return { bookingSegmentId: segment.id, bookingVersion: segment.bookingVersion,
    version: version+1, method: input.method, segmentPriceMinor: discounted,
    commissionPoolMinor: quote.commissionMinor, lines };
}

export async function previewProviderAllocation(input: AllocationInput):
  Promise<AllocationPreview> {
  localOnly(); assertCapability(input.context,"billing.manage");
  return prisma.$transaction(tx => prepare(input,tx));
}

export async function publishProviderAllocation(input: AllocationInput &
  { expectedBookingVersion: number }): Promise<AllocationPreview> {
  localOnly(); assertCapability(input.context,"billing.manage");
  return prisma.$transaction(async tx => {
    const preview = await prepare(input,tx);
    if (preview.bookingVersion !== input.expectedBookingVersion)
      throw new AppError("CONFLICT", "Booking changed after preview", 409);
    const location = requireLocation(input.context);
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      select period.id from public.payroll_periods period
      join public.payroll_lines line on line.period_id=period.id
      where period.organization_id=${input.context.organization.id}::uuid
        and period.location_id=${location.id}::uuid
        and period.status='APPROVED' and line.kind='COMMISSION'
        and line.source_ref like ${preview.bookingSegmentId+':%'} limit 1
    `);
    if (locked[0]) throw new AppError("CONFLICT", "Approved payroll locks allocation", 409);
    const inserted = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.commission_segment_allocation_sets
        (organization_id,location_id,booking_segment_id,version,method,
         segment_price_minor,commission_pool_minor,booking_version,published_by_profile_id)
      values (${input.context.organization.id}::uuid,${location.id}::uuid,
        ${preview.bookingSegmentId}::uuid,${preview.version},${preview.method},
        ${preview.segmentPriceMinor},${preview.commissionPoolMinor},
        ${preview.bookingVersion},${input.context.session.profileId}::uuid)
      returning id
    `);
    for (const line of preview.lines) await tx.$executeRaw(Prisma.sql`
      insert into public.commission_segment_allocation_lines
        (allocation_set_id,staff_profile_id,share_bps,quoted_minor)
      values (${inserted[0].id}::uuid,${line.staffProfileId}::uuid,
        ${line.shareBps},${line.quotedMinor})
    `);
    await tx.audit_logs.create({ data: { organization_id: input.context.organization.id,
      location_id: location.id, actor_profile_id: input.context.session.profileId,
      action: "PROVIDER_ALLOCATION_PUBLISHED", target_type: "BOOKING_SEGMENT",
      target_id: preview.bookingSegmentId, outcome: "SUCCESS", request_id: input.requestId,
      after_json: preview } });
    return preview;
  }, { isolationLevel: "Serializable" });
}
