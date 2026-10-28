import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { assertCapability, requireLocation } from "@/server/authorization/context";
import { prisma } from "@/server/database/prisma";
import { AppError } from "@/server/http/errors";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { getBenefitBalance, issueSyntheticBenefit,
  moveSyntheticBenefit } from "@/server/members/benefits";
import { getWalletBalance } from "@/server/members/ledger";
import { publishPromotion } from "@/server/members/policy";
import { loadPublishedCommissionRules, publishCommissionRule,
  quoteCommission } from "@/server/payroll/commission-quote";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ISSUE"), customerId: z.uuid(),
    kind: z.enum(["COUPON", "SERVICE_PACKAGE"]), quantity: z.number().int().positive(),
    serviceVariantId: z.uuid().optional(), discountMinor: z.number().int().positive().optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    idempotencyKey: z.string().min(12) }).strict(),
  z.object({ action: z.enum(["RESERVE", "REDEEM", "RELEASE", "REFUND", "CANCEL"]),
    customerId: z.uuid(), issueId: z.uuid(), bookingId: z.uuid(),
    bookingRefundId: z.uuid().optional(), quantity: z.number().int().positive(),
    idempotencyKey: z.string().min(12) }).strict(),
  z.object({ action: z.literal("PUBLISH_PROMOTION"), policyId: z.uuid() }).strict(),
  z.object({ action: z.literal("PUBLISH_COMMISSION"), ruleId: z.uuid() }).strict(),
  z.object({ action: z.literal("CREATE_PROMOTION"),
    policyKey: z.string().regex(/^[A-Z0-9_]{3,80}$/), version: z.number().int().positive(),
    kind: z.enum(["SEASONAL", "MOTHERS_DAY", "BIRTHDAY", "VIP"]),
    priority: z.number().int(), discountPercent: z.number().int().min(1).max(100),
    maxDiscountMinor: z.number().int().nonnegative().nullable(),
    serviceVariantId: z.uuid().nullable(),
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveUntil: z.iso.datetime({ offset: true }),
    attestationRequired: z.boolean() }).strict(),
  z.object({ action: z.literal("CREATE_COMMISSION"),
    ruleKey: z.string().regex(/^[A-Z0-9_]{3,80}$/), version: z.number().int().positive(),
    priority: z.number().int(),
    basis: z.enum(["ORIGINAL", "DISCOUNTED", "PAID_COMPONENT", "FIXED"]),
    rateBps: z.number().int().min(0).max(10000).nullable(),
    fixedMinor: z.number().int().nonnegative().nullable(),
    serviceVariantId: z.uuid().nullable(), staffProfileId: z.uuid().nullable(),
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveUntil: z.iso.datetime({ offset: true }),
    excludeFeeTax: z.boolean() }).strict(),
]);

async function contextFor(request: NextRequest) {
  const session = await requireRequestSession(request);
  const scope = merchantScopeSchema.parse({
    organization: request.nextUrl.searchParams.get("organization"),
    location: request.nextUrl.searchParams.get("location"),
  });
  return { session, context: await resolveMerchantContext({ session,
    organizationSlug: scope.organization, locationSlug: scope.location }) };
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { context } = await contextFor(request);
    assertCapability(context, "billing.read");
    const location = requireLocation(context);
    if (request.nextUrl.searchParams.get("policies") === "true") {
      assertCapability(context, "billing.manage");
      const [promotions, commissions] = await Promise.all([
        prisma.$queryRaw<{ id: string; policyKey: string; version: number;
          kind: string; publishedAt: Date | null }[]>(Prisma.sql`
          select id,policy_key as "policyKey",version,kind,
            published_at as "publishedAt"
          from public.member_promotion_policies
          where organization_id=${context.organization.id}::uuid
            and (location_id is null or location_id=${location.id}::uuid)
          order by created_at desc limit 30
        `),
        prisma.$queryRaw<{ id: string; version: number; basis: string;
          publishedAt: Date | null }[]>(Prisma.sql`
          select id,version,basis,published_at as "publishedAt"
          from public.commission_rule_versions
          where organization_id=${context.organization.id}::uuid
            and (location_id is null or location_id=${location.id}::uuid)
          order by created_at desc limit 30
        `),
      ]);
      return jsonSuccess({ promotions, commissions });
    }
    const customerId = request.nextUrl.searchParams.get("customerId");
    if (customerId) {
      const id = z.uuid().parse(customerId);
      const customer = await prisma.customers.findFirst({ where: {
        id, organization_id: context.organization.id }, select: { id: true } });
      if (!customer) throw new AppError("NOT_FOUND", "Customer not found", 404);
      const [wallet, benefits] = await Promise.all([
        getWalletBalance(context.organization.id, id),
        getBenefitBalance(context.organization.id, id),
      ]);
      return jsonSuccess({ wallet, benefits });
    }
    const bookingId = request.nextUrl.searchParams.get("bookingId");
    if (bookingId) {
      const booking = await prisma.bookings.findFirst({ where: {
        id: z.uuid().parse(bookingId), organization_id: context.organization.id,
        location_id: location.id }, select: { id: true, total_minor: true,
        refunded_minor: true, completed_at: true,
        booking_segments: { select: { id: true, service_variant_id: true,
          assigned_staff_id: true, price_minor: true } } } });
      if (!booking || !booking.completed_at || booking.booking_segments.length !== 1) {
        throw new AppError("CONFLICT", "Single completed booking required", 409);
      }
      const segment = booking.booking_segments[0];
      if (!segment.service_variant_id || !segment.assigned_staff_id) {
        throw new AppError("CONFLICT", "Assigned service required", 409);
      }
      const staff = await prisma.staff_profiles.findFirst({ where: {
        id: segment.assigned_staff_id, organization_id: context.organization.id,
      }, select: { linked_profile_id: true } });
      if (!staff?.linked_profile_id) throw new AppError("CONFLICT", "Linked employee required", 409);
      const tender = await prisma.$queryRaw<{ bonus: bigint }[]>(Prisma.sql`
        select coalesce(sum(bonus_minor),0)::bigint as bonus
        from public.member_wallet_transactions
        where organization_id=${context.organization.id}::uuid
          and booking_id=${booking.id}::uuid and kind='REDEMPTION'
      `);
      const bonus = Math.min(booking.total_minor, Number(tender[0].bonus));
      const rules = await loadPublishedCommissionRules(context.organization.id,
        booking.completed_at);
      const base = { id: segment.id, organizationId: context.organization.id,
        locationId: location.id, serviceVariantId: segment.service_variant_id,
        staffProfileIds: [staff.linked_profile_id], listPriceMinor: segment.price_minor,
        discountedPriceMinor: booking.total_minor, paymentFeeMinor: 0, taxMinor: 0,
        completedAt: booking.completed_at };
      return jsonSuccess({ quote: quoteCommission([base], {
        paidMinor: booking.total_minor-bonus, bonusMinor: bonus }, rules),
        refundQuote: booking.refunded_minor ? quoteCommission([{ ...base,
          refundMinor: Math.min(booking.refunded_minor, booking.total_minor) }],
          { paidMinor: booking.total_minor-bonus, bonusMinor: bonus }, rules) : [] });
    }
    throw new AppError("BAD_REQUEST", "Customer or booking required", 400);
  } catch (error) { return jsonError(error, requestId, request); }
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { session, context } = await contextFor(request);
    assertSessionCsrf(request, session);
    assertCapability(context, "billing.manage");
    if (process.env.APP_ENV !== "test" || process.env.MEMBER_VALUE_TEST_ONLY !== "true") {
      throw new AppError("FEATURE_UNAVAILABLE", "Benefit changes are not activated", 503);
    }
    const location = requireLocation(context);
    const input = command.parse(await request.json());
    if (input.action === "ISSUE") {
      const issueId = await issueSyntheticBenefit({ organizationId: context.organization.id,
        locationId: location.id, customerId: input.customerId, kind: input.kind,
        quantity: input.quantity, serviceVariantId: input.serviceVariantId,
        discountMinor: input.discountMinor,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        idempotencyKey: input.idempotencyKey });
      return jsonSuccess({ issueId });
    }
    if (input.action === "PUBLISH_PROMOTION") {
      await publishPromotion({ context, policyId: input.policyId, requestId });
      return jsonSuccess({ published: true });
    }
    if (input.action === "PUBLISH_COMMISSION") {
      await publishCommissionRule({ context, ruleId: input.ruleId, requestId });
      return jsonSuccess({ published: true });
    }
    if (input.action === "CREATE_PROMOTION") {
      assertCapability(context, "catalog.manage");
      if (new Date(input.effectiveUntil) <= new Date(input.effectiveFrom)) {
        throw new AppError("BAD_REQUEST", "Invalid promotion dates", 400);
      }
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into public.member_promotion_policies
          (organization_id,location_id,service_variant_id,policy_key,version,
           kind,priority,discount_percent,max_discount_minor,effective_from,
           effective_until,attestation_required,created_by_profile_id)
        values (${context.organization.id}::uuid,${location.id}::uuid,
          ${input.serviceVariantId}::uuid,${input.policyKey},${input.version},
          ${input.kind},${input.priority},${input.discountPercent},
          ${input.maxDiscountMinor},${new Date(input.effectiveFrom)},
          ${new Date(input.effectiveUntil)},${input.attestationRequired},
          ${context.session.profileId}::uuid) returning id
      `);
      return jsonSuccess({ policyId: rows[0].id });
    }
    if (input.action === "CREATE_COMMISSION") {
      assertCapability(context, "organization.manage");
      if (new Date(input.effectiveUntil) <= new Date(input.effectiveFrom) ||
          (input.basis === "FIXED" ? input.fixedMinor === null || input.rateBps !== null :
            input.rateBps === null || input.fixedMinor !== null)) {
        throw new AppError("BAD_REQUEST", "Invalid commission rule", 400);
      }
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into public.commission_rule_versions
          (organization_id,location_id,service_variant_id,staff_profile_id,
           rule_key,version,priority,basis,rate_bps,fixed_minor,exclude_fee_tax,
           effective_from,effective_until,created_by_profile_id)
        values (${context.organization.id}::uuid,${location.id}::uuid,
          ${input.serviceVariantId}::uuid,${input.staffProfileId}::uuid,
          ${input.ruleKey},${input.version},${input.priority},${input.basis},
          ${input.rateBps},${input.fixedMinor},${input.excludeFeeTax},
          ${new Date(input.effectiveFrom)},${new Date(input.effectiveUntil)},
          ${context.session.profileId}::uuid) returning id
      `);
      return jsonSuccess({ ruleId: rows[0].id });
    }
    return jsonSuccess(await moveSyntheticBenefit({ organizationId: context.organization.id,
      customerId: input.customerId, issueId: input.issueId,
      bookingId: input.bookingId, bookingRefundId: input.bookingRefundId,
      action: input.action, quantity: input.quantity,
      idempotencyKey: input.idempotencyKey }));
  } catch (error) { return jsonError(error, requestId, request); }
}
