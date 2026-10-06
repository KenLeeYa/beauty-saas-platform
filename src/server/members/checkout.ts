import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { getEntitlement } from "../entitlements/service";
import { AppError } from "../http/errors";
import { formatDateInTimeZone } from "../time/timezone";
import { quotePromotion, type PromotionQuote } from "./policy";

/** Synthetic promotion checkout updates the existing booking price snapshot. */
export async function applySyntheticPromotion(input: { context: OrganizationContext;
  bookingId: string; expectedVersion: number; relationshipAttested?: boolean;
  requestId: string }): Promise<PromotionQuote & { bookingVersion: number }> {
  if (process.env.APP_ENV !== "test" || process.env.MEMBER_VALUE_TEST_ONLY !== "true") {
    throw new AppError("FEATURE_UNAVAILABLE", "Promotion checkout is not activated", 503);
  }
  assertCapability(input.context, "payment.manage");
  const location = requireLocation(input.context);
  const entitlement = await getEntitlement(input.context.organization.id,
    "MEMBERSHIPS_PACKAGES");
  if (!entitlement.enabled) throw new AppError("FEATURE_UNAVAILABLE",
    "Promotion checkout disabled", 503);
  return prisma.$transaction(async transaction => {
    const switches = await transaction.$queryRaw<{ isActive: boolean }[]>(Prisma.sql`
      select is_active as "isActive" from public.store_module_activations
      where organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid
        and feature_key='MEMBERSHIPS_PACKAGES'::public.feature_key limit 1
    `);
    if (switches[0] && !switches[0].isActive) {
      throw new AppError("FEATURE_UNAVAILABLE", "Promotion checkout disabled", 503);
    }
    const rows = await transaction.$queryRaw<{ id: string; customerId: string;
      version: number; paidMinor: number; currency: string; status: string;
      policySnapshot: unknown }[]>(Prisma.sql`
      select id, customer_id as "customerId", version, paid_minor as "paidMinor",
        currency, status, policy_snapshot as "policySnapshot"
      from public.bookings where id=${input.bookingId}::uuid
        and organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid for update
    `);
    const booking = rows[0];
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found", 404);
    if (booking.version !== input.expectedVersion || booking.paidMinor > 0 ||
        !["CONFIRMED", "PENDING_PAYMENT"].includes(booking.status)) {
      throw new AppError("CONFLICT", "Booking price can no longer change", 409);
    }
    if (typeof booking.policySnapshot === "object" && booking.policySnapshot !== null &&
        "promotion" in booking.policySnapshot) {
      throw new AppError("CONFLICT", "Promotion already applied", 409);
    }
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${input.context.organization.id}),
        hashtext(${booking.customerId}))
    `);
    const segments = await transaction.booking_segments.findMany({ where: {
      organization_id: input.context.organization.id, booking_id: booking.id,
    }, select: { service_variant_id: true, price_minor: true } });
    if (!segments.length || segments.some(segment => !segment.service_variant_id)) {
      throw new AppError("CONFLICT", "Booking service snapshot unavailable", 409);
    }
    const quote = await quotePromotion({ organizationId: input.context.organization.id,
      locationId: location.id, customerId: booking.customerId,
      timezone: location.timezone, currency: booking.currency,
      segments: segments.map(segment => ({ serviceVariantId: segment.service_variant_id!,
        listPriceMinor: segment.price_minor })), at: new Date(),
      relationshipAttested: input.relationshipAttested });
    const year = Number(formatDateInTimeZone(new Date(), location.timezone).slice(0,4));
    for (const policyId of new Set(quote.lines.map(line => line.policyId).filter(Boolean))) {
      const kind = await transaction.$queryRaw<{ kind: string }[]>(Prisma.sql`
        select kind from public.member_promotion_policies where id=${policyId}::uuid
      `);
      if (kind[0]?.kind === "BIRTHDAY") {
        await transaction.$executeRaw(Prisma.sql`
          insert into public.member_promotion_usage
            (organization_id,policy_id,customer_id,booking_id,benefit_year)
          values (${input.context.organization.id}::uuid,${policyId}::uuid,
            ${booking.customerId}::uuid,${booking.id}::uuid,${year})
        `);
      }
    }
    const prior = booking.policySnapshot as Record<string, unknown>;
    await transaction.$executeRaw(Prisma.sql`
      update public.bookings set subtotal_minor=${quote.listPriceMinor},
        discount_minor=${quote.discountMinor},total_minor=${quote.payableMinor},
        policy_snapshot=${JSON.stringify({ ...prior, promotion: quote })}::jsonb,
        version=version+1,updated_at=now()
      where id=${booking.id}::uuid
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id, location_id: location.id,
      actor_profile_id: input.context.session.profileId,
      action: "PROMOTION_CHECKOUT_APPLIED", target_type: "BOOKING",
      target_id: booking.id, outcome: "SUCCESS", request_id: input.requestId,
      after_json: { listPriceMinor: quote.listPriceMinor,
        discountMinor: quote.discountMinor, payableMinor: quote.payableMinor },
    } });
    return { ...quote, bookingVersion: booking.version + 1 };
  }, { isolationLevel: "Serializable" });
}
