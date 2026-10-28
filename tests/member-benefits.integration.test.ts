import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";
import { enableSyntheticMemberEntitlement } from "./member-entitlement-fixture";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "keeps coupon and package issue, reserve, redeem, release and refund scoped and idempotent",
  async () => {
    loadEnvConfig(process.cwd());
    process.env.MEMBER_VALUE_TEST_ONLY = "true";
    const [{ prisma }, { issueSyntheticBenefit, moveSyntheticBenefit,
      getBenefitBalance }, { randomToken, sha256 }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/members/benefits"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const ownerId = "33333333-3333-4333-8333-333333333301";
    const overrideId = await enableSyntheticMemberEntitlement(prisma, organizationId, ownerId);
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Benefit synthetic",
    }, select: { id: true } });
    const booking = await prisma.bookings.create({ data: {
      organization_id: organizationId, location_id: locationId,
      customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 1000,
      total_minor: 1000, tracking_token_hash: sha256(randomToken(32)), is_test: true,
    }, select: { id: true } });
    await prisma.$executeRaw(Prisma.sql`
      insert into public.booking_segments
        (organization_id,location_id,booking_id,service_variant_id,
         service_name_snapshot,variant_name_snapshot,starts_at,ends_at,
         duration_minutes,price_minor)
      values (${organizationId}::uuid,${locationId}::uuid,${booking.id}::uuid,
        '66666666-6666-4666-8666-666666666611'::uuid,
        'Synthetic service','Synthetic variant',
        ${new Date(Date.now()+86400_000)},${new Date(Date.now()+90000_000)},
        60,1000)
    `);
    try {
      const couponKey = randomToken(24);
      const coupon = await issueSyntheticBenefit({ organizationId, locationId,
        customerId: customer.id, kind: "COUPON", quantity: 2,
        discountMinor: 100, idempotencyKey: couponKey });
      expect(await issueSyntheticBenefit({ organizationId, locationId, customerId: customer.id,
        kind: "COUPON", quantity: 2, discountMinor: 100,
        idempotencyKey: couponKey })).toBe(coupon);
      await expect(issueSyntheticBenefit({ organizationId, locationId,
        customerId: customer.id, kind: "COUPON", quantity: 2,
        discountMinor: 999, idempotencyKey: couponKey }))
        .rejects.toThrow("different terms");
      await expect(prisma.$executeRaw(Prisma.sql`
        update public.member_benefit_issues
        set terms_snapshot='{"quantity":100}'::jsonb where id=${coupon}::uuid
      `)).rejects.toBeTruthy();
      const pkg = await issueSyntheticBenefit({ organizationId, locationId,
        customerId: customer.id, kind: "SERVICE_PACKAGE", quantity: 1,
        serviceVariantId: "66666666-6666-4666-8666-666666666611",
        idempotencyKey: randomToken(24) });
      const reserveKey = randomToken(24);
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: coupon, bookingId: booking.id, action: "RESERVE", quantity: 1,
        idempotencyKey: reserveKey })).toEqual({ available: 1 });
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: coupon, bookingId: booking.id, action: "RESERVE", quantity: 1,
        idempotencyKey: reserveKey })).toEqual({ available: 1 });
      await expect(moveSyntheticBenefit({ organizationId,
        customerId: customer.id, issueId: coupon, bookingId: booking.id,
        action: "REDEEM", quantity: 2, idempotencyKey: randomToken(24) }))
        .rejects.toThrow("Reservation required");
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: coupon, bookingId: booking.id, action: "REDEEM", quantity: 1,
        idempotencyKey: randomToken(24) })).toEqual({ available: 1 });
      await expect(moveSyntheticBenefit({ organizationId,
        customerId: customer.id, issueId: coupon, bookingId: booking.id,
        action: "REDEEM", quantity: 1, idempotencyKey: randomToken(24) }))
        .rejects.toThrow("Reservation required");
      await expect(moveSyntheticBenefit({ organizationId,
        customerId: customer.id, issueId: pkg, bookingId: booking.id,
        action: "RESERVE", quantity: 1, idempotencyKey: randomToken(24) }))
        .rejects.toThrow("cannot stack");
      await expect(moveSyntheticBenefit({ organizationId:
        "99999999-9999-4999-8999-999999999999", customerId: customer.id,
        issueId: coupon, bookingId: booking.id, action: "RESERVE", quantity: 1,
        idempotencyKey: randomToken(24) })).rejects.toThrow("Benefit not found");
      const payment = await prisma.booking_payments.create({ data: {
        organization_id: organizationId, location_id: locationId,
        booking_id: booking.id, method: "MANUAL_TRANSFER", status: "PAID",
        amount_minor: 1000, currency: "TWD", confirmed_by: ownerId,
        confirmed_at: new Date(),
      }, select: { id: true } });
      const refund = await prisma.booking_refunds.create({ data: {
        organization_id: organizationId, booking_id: booking.id,
        booking_payment_id: payment.id, amount_minor: 100, status: "CONFIRMED",
        reason: "Synthetic coupon refund", recorded_by: ownerId,
        confirmed_by: ownerId, confirmed_at: new Date(),
      }, select: { id: true } });
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: coupon, bookingId: booking.id, action: "REFUND", quantity: 1,
        bookingRefundId: refund.id, idempotencyKey: randomToken(24) }))
        .toEqual({ available: 2 });
      await expect(moveSyntheticBenefit({ organizationId,
        customerId: customer.id, issueId: coupon, bookingId: booking.id,
        action: "REFUND", quantity: 1, bookingRefundId: refund.id,
        idempotencyKey: randomToken(24) })).rejects.toThrow("Refund exceeds");
      const packageReservation = randomToken(24);
      await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: pkg, bookingId: booking.id, action: "RESERVE", quantity: 1,
        idempotencyKey: packageReservation });
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: pkg, bookingId: booking.id, action: "RELEASE", quantity: 1,
        idempotencyKey: randomToken(24) })).toEqual({ available: 1 });
      const packageBooking = await prisma.bookings.create({ data: {
        organization_id: organizationId, location_id: locationId,
        customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 1000,
        total_minor: 1000, tracking_token_hash: sha256(randomToken(32)), is_test: true,
      }, select: { id: true } });
      await prisma.$executeRaw(Prisma.sql`
        insert into public.booking_segments
          (organization_id,location_id,booking_id,service_variant_id,
           service_name_snapshot,variant_name_snapshot,starts_at,ends_at,
           duration_minutes,price_minor)
        values (${organizationId}::uuid,${locationId}::uuid,${packageBooking.id}::uuid,
          '66666666-6666-4666-8666-666666666611'::uuid,
          'Synthetic service','Synthetic variant',
          ${new Date(Date.now()+172800_000)},${new Date(Date.now()+176400_000)},
          60,1000)
      `);
      await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: pkg, bookingId: packageBooking.id, action: "RESERVE",
        quantity: 1, idempotencyKey: randomToken(24) });
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: pkg, bookingId: packageBooking.id, action: "REDEEM",
        quantity: 1, idempotencyKey: randomToken(24) })).toEqual({ available: 0 });
      const packagePayment = await prisma.booking_payments.create({ data: {
        organization_id: organizationId, location_id: locationId,
        booking_id: packageBooking.id, method: "MANUAL_TRANSFER", status: "PAID",
        amount_minor: 1000, currency: "TWD", confirmed_by: ownerId,
        confirmed_at: new Date(),
      }, select: { id: true } });
      const packageRefund = await prisma.booking_refunds.create({ data: {
        organization_id: organizationId, booking_id: packageBooking.id,
        booking_payment_id: packagePayment.id, amount_minor: 1000,
        status: "CONFIRMED", reason: "Synthetic full package return",
        recorded_by: ownerId, confirmed_by: ownerId, confirmed_at: new Date(),
      }, select: { id: true } });
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: pkg, bookingId: packageBooking.id, action: "REFUND",
        quantity: 1, bookingRefundId: packageRefund.id,
        idempotencyKey: randomToken(24) })).toEqual({ available: 1 });
      const cancellingBooking = await prisma.bookings.create({ data: {
        organization_id: organizationId, location_id: locationId,
        customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 1000,
        total_minor: 1000, tracking_token_hash: sha256(randomToken(32)), is_test: true,
      }, select: { id: true } });
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: coupon, bookingId: cancellingBooking.id, action: "RESERVE",
        quantity: 1, idempotencyKey: randomToken(24) })).toEqual({ available: 1 });
      await prisma.bookings.update({ where: { id: cancellingBooking.id },
        data: { status: "CANCELLED", cancelled_at: new Date() } });
      expect((await getBenefitBalance(organizationId,customer.id))
        .find(row => row.id === coupon)?.available).toBe(2);
      expect((await getBenefitBalance(organizationId, customer.id))
        .map(row => row.available).sort()).toEqual([1, 2]);
      await prisma.$executeRaw(Prisma.sql`
        insert into public.store_module_activations
          (organization_id,location_id,feature_key,is_active)
        values (${organizationId}::uuid,${locationId}::uuid,
          'MEMBERSHIPS_PACKAGES'::public.feature_key,false)
        on conflict (organization_id,location_id,feature_key)
        do update set is_active=false
      `);
      await expect(issueSyntheticBenefit({ organizationId, locationId,
        customerId: customer.id, kind: "COUPON", quantity: 1,
        discountMinor: 100, idempotencyKey: randomToken(24) }))
        .rejects.toThrow("issuance disabled");
      expect((await getBenefitBalance(organizationId, customer.id)).length).toBe(2);
      expect(await moveSyntheticBenefit({ organizationId, customerId: customer.id,
        issueId: coupon, bookingId: booking.id, action: "CANCEL", quantity: 1,
        idempotencyKey: randomToken(24) })).toEqual({ available: 1 });
      process.env.MEMBER_VALUE_TEST_ONLY = "false";
      await expect(issueSyntheticBenefit({ organizationId, locationId, customerId: customer.id,
        kind: "COUPON", quantity: 1, discountMinor: 100,
        idempotencyKey: randomToken(24) })).rejects.toThrow("not activated");
    } finally {
      process.env.MEMBER_VALUE_TEST_ONLY = "true";
      await prisma.organization_feature_overrides.delete({ where: { id: overrideId } });
      await prisma.$executeRaw(Prisma.sql`
        delete from public.store_module_activations
        where organization_id=${organizationId}::uuid
          and location_id=${locationId}::uuid
          and feature_key='MEMBERSHIPS_PACKAGES'::public.feature_key
      `);
    }
  });
