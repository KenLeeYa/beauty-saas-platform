import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";

import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "quotes versioned exclusive promotion, attestation, cap and birthday one-use",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { quotePromotion, publishPromotion },
      { randomToken, sha256 }, { formatDateInTimeZone },
      { setCustomerStatus }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/members/policy"),
      import("../src/server/security/crypto"),
      import("../src/server/time/timezone"),
      import("../src/modules/crm/server/customer-status"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const baseVariant = await prisma.service_variants.findUniqueOrThrow({ where: {
      id: "66666666-6666-4666-8666-666666666611" },
      select: { service_id: true } });
    const variant = await prisma.service_variants.create({ data: {
      organization_id: organizationId, service_id: baseVariant.service_id,
      name: `Policy ${randomToken(8)}`, duration_minutes: 60, price_minor: 1000,
    }, select: { id: true } });
    const variantId = variant.id;
    const actorId = "33333333-3333-4333-8333-333333333301";
    const organization = await prisma.organizations.findUniqueOrThrow({
      where: { id: organizationId }, select: { slug: true, name: true, status: true } });
    const location = await prisma.locations.findUniqueOrThrow({
      where: { id: locationId }, select: { slug: true, name: true, timezone: true } });
    const context: OrganizationContext = { session: { id: randomToken(16),
      profileId: actorId, email: "owner@example.test", displayName: "Owner",
      platformRole: null, expiresAt: new Date(Date.now()+60_000), csrfTokenHash: "" },
      organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationId]),
      linkedStaffProfileId: null };
    const at = new Date();
    const [, month, day] = formatDateInTimeZone(at, location.timezone).split("-").map(Number);
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Policy synthetic",
      birthday: new Date(Date.UTC(2000, month-1, day)),
    }, select: { id: true } });
    const key = `POLICY_${randomToken(5).replace(/[^A-Za-z0-9]/g, "A").toUpperCase()}`;
    const maximum = await prisma.$queryRaw<{ maximum: number }[]>(Prisma.sql`
      select coalesce(max(priority), 0) as maximum
      from public.member_promotion_policies
      where organization_id = ${organizationId}::uuid
    `);
    const priority = Math.max(100000, maximum[0].maximum + 10);
    const starts = new Date(at.getTime()-3600_000);
    const ends = new Date(at.getTime()+86400_000);
    const create = async (kind: string, rank: number, percent: number,
      cap: number | null, attest: boolean) => {
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into public.member_promotion_policies
          (organization_id,location_id,service_variant_id,policy_key,version,
           kind,priority,discount_percent,max_discount_minor,effective_from,
           effective_until,attestation_required,created_by_profile_id)
        values (${organizationId}::uuid,${locationId}::uuid,${variantId}::uuid,
          ${`${key}_${kind}`},1,${kind},${rank},${percent},${cap},
          ${starts},${ends},${attest},${actorId}::uuid) returning id
      `);
      return rows[0].id;
    };
    const mother = await create("MOTHERS_DAY", priority, 20, 150, true);
    const birthday = await create("BIRTHDAY", priority+1, 30, null, false);
    const vip = await create("VIP", priority-1, 10, null, false);
    for (const id of [mother,birthday,vip]) {
      await publishPromotion({ context, policyId: id, requestId: randomToken(12) });
    }
    const input = { organizationId, locationId, customerId: customer.id,
      timezone: location.timezone, currency: "TWD", at,
      segments: [{ serviceVariantId: variantId, listPriceMinor: 1000 }] };
    expect((await quotePromotion({ ...input, relationshipAttested: true })).lines[0])
      .toMatchObject({ discountMinor: 300, policyId: birthday, policyVersion: 1 });
    const booking = await prisma.bookings.create({ data: {
      organization_id: organizationId, location_id: locationId,
      customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 1000,
      total_minor: 1000, tracking_token_hash: sha256(randomToken(32)), is_test: true,
    }, select: { id: true } });
    await prisma.$executeRaw(Prisma.sql`
      insert into public.member_promotion_usage
        (organization_id,policy_id,customer_id,booking_id,benefit_year)
      values (${organizationId}::uuid,${birthday}::uuid,${customer.id}::uuid,
        ${booking.id}::uuid,${Number(formatDateInTimeZone(at,location.timezone).slice(0,4))})
    `);
    expect((await quotePromotion({ ...input, relationshipAttested: true })).lines[0])
      .toMatchObject({ discountMinor: 150, policyId: mother });
    expect((await quotePromotion(input)).lines[0])
      .toMatchObject({ discountMinor: 0, policyId: null });
    await setCustomerStatus({ context, customerId: customer.id, scope: "LOCATION",
      statusKind: "VIP", enabled: true, reason: "synthetic VIP",
      requestId: randomToken(12) });
    expect((await quotePromotion({ ...input, at: new Date() })).lines[0])
      .toMatchObject({ discountMinor: 100, policyId: vip });
    const conflicting = await create("SEASONAL", priority, 20, null, false);
    await expect(publishPromotion({ context, policyId: conflicting,
      requestId: randomToken(12) })).rejects.toMatchObject({ status: 409 });
    await expect(prisma.$executeRaw(Prisma.sql`
      update public.member_promotion_policies set discount_percent=90
      where id=${mother}::uuid
    `)).rejects.toBeTruthy();
    expect((await prisma.bookings.findUniqueOrThrow({ where: { id: booking.id } })).total_minor)
      .toBe(1000);
  }, 60_000,
);
