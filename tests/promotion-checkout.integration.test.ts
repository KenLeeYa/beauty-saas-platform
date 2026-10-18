import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";

import type { OrganizationContext } from "../src/server/authorization/context";
import { enableSyntheticMemberEntitlement } from "./member-entitlement-fixture";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "snapshots a published quote into synthetic booking checkout before payment",
  async () => {
    loadEnvConfig(process.cwd()); process.env.MEMBER_VALUE_TEST_ONLY = "true";
    const [{ prisma }, { applySyntheticPromotion }, { randomToken, sha256 }] =
      await Promise.all([import("../src/server/database/prisma"),
        import("../src/server/members/checkout"),
        import("../src/server/security/crypto")]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const baseVariant = await prisma.service_variants.findUniqueOrThrow({ where: {
      id: "66666666-6666-4666-8666-666666666611" },
      select: { service_id: true } });
    const variant = await prisma.service_variants.create({ data: {
      organization_id: organizationId, service_id: baseVariant.service_id,
      name: `Checkout ${randomToken(8)}`, duration_minutes: 60, price_minor: 1000,
    }, select: { id: true } });
    const variantId = variant.id;
    const ownerId = "33333333-3333-4333-8333-333333333301";
    const overrideId = await enableSyntheticMemberEntitlement(prisma, organizationId, ownerId);
    await prisma.$executeRaw(Prisma.sql`
      delete from public.member_promotion_policies
      where organization_id=${organizationId}::uuid and policy_key like 'CHECKOUT_%'
    `);
    const organization = await prisma.organizations.findUniqueOrThrow({ where: {
      id: organizationId }, select: { slug: true, name: true, status: true } });
    const location = await prisma.locations.findUniqueOrThrow({ where: { id: locationId },
      select: { slug: true, name: true, timezone: true } });
    const context: OrganizationContext = { session: { id: randomToken(16),
      profileId: ownerId, email: "owner@example.test", displayName: "Owner",
      platformRole: null, expiresAt: new Date(Date.now()+60_000), csrfTokenHash: "" },
      organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationId]),
      linkedStaffProfileId: null };
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Checkout synthetic",
    }, select: { id: true } });
    const booking = await prisma.bookings.create({ data: {
      organization_id: organizationId, location_id: locationId,
      customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 1000,
      total_minor: 1000, tracking_token_hash: sha256(randomToken(32)), is_test: true,
    }, select: { id: true, version: true } });
    const now = new Date();
    await prisma.$executeRaw(Prisma.sql`
      insert into public.booking_segments
        (organization_id,location_id,booking_id,service_variant_id,
         service_name_snapshot,variant_name_snapshot,starts_at,ends_at,
         duration_minutes,price_minor)
      values (${organizationId}::uuid,${locationId}::uuid,${booking.id}::uuid,
        ${variantId}::uuid,'Synthetic service','Synthetic variant',
        ${new Date(now.getTime()+86400_000)},${new Date(now.getTime()+90000_000)},
        60,1000)
    `);
    const max = await prisma.$queryRaw<{ priority: number }[]>(Prisma.sql`
      select coalesce(max(priority),0)+100 as priority
      from public.member_promotion_policies where organization_id=${organizationId}::uuid
    `);
    const policy = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.member_promotion_policies
        (organization_id,location_id,service_variant_id,policy_key,version,
         kind,priority,discount_percent,effective_from,effective_until,
         published_at,created_by_profile_id)
      values (${organizationId}::uuid,${locationId}::uuid,${variantId}::uuid,
        ${`CHECKOUT_${randomToken(8).replace(/[^A-Za-z0-9]/g,"A").toUpperCase()}`},1,
        'SEASONAL',${max[0].priority},20,${new Date(now.getTime()-3600_000)},
        ${new Date(now.getTime()+86400_000)},now(),${ownerId}::uuid)
      returning id
    `);
    const quote = await applySyntheticPromotion({ context, bookingId: booking.id,
      expectedVersion: booking.version, requestId: randomToken(12) });
    expect(quote).toMatchObject({ listPriceMinor: 1000, discountMinor: 200,
      payableMinor: 800, bookingVersion: booking.version+1 });
    const stored = await prisma.bookings.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored).toMatchObject({ subtotal_minor: 1000, discount_minor: 200,
      total_minor: 800 });
    expect((stored.policy_snapshot as { promotion: { lines: Array<{
      policyId: string }> } }).promotion.lines[0].policyId).toBe(policy[0].id);
    await expect(applySyntheticPromotion({ context, bookingId: booking.id,
      expectedVersion: booking.version, requestId: randomToken(12) }))
      .rejects.toThrow("price can no longer change");
    const foreign = { ...context, organization: { ...context.organization,
      id: "99999999-9999-4999-8999-999999999999" } };
    await expect(applySyntheticPromotion({ context: foreign, bookingId: booking.id,
      expectedVersion: stored.version, requestId: randomToken(12) }))
      .rejects.toMatchObject({ status: 503 });
    process.env.MEMBER_VALUE_TEST_ONLY = "false";
    await expect(applySyntheticPromotion({ context, bookingId: booking.id,
      expectedVersion: stored.version, requestId: randomToken(12) }))
      .rejects.toThrow("not activated");
    process.env.MEMBER_VALUE_TEST_ONLY = "true";
    await prisma.$executeRaw(Prisma.sql`
      delete from public.member_promotion_policies where id=${policy[0].id}::uuid
    `);
    await prisma.organization_feature_overrides.delete({ where: { id: overrideId } });
  }, 60_000);
