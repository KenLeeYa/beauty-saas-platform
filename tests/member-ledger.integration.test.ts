import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";
import { enableSyntheticMemberEntitlement } from "./member-entitlement-fixture";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "keeps paid/bonus ledgers atomic across redemption, QR retry, race and refund",
  async () => {
    loadEnvConfig(process.cwd());
    process.env.MEMBER_VALUE_TEST_ONLY = "true";
    const [{ prisma }, { issueSyntheticWalletValue, getWalletBalance,
      reserveEntitlement, redeemEntitlement, releaseReservation, refundSettlement,
      allocateTender }, { randomToken, sha256 },
      { ensureCustomerLineLink, linkExistingCustomerByBooking,
        createLineMobileSession }, { GET: getMember }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/members/ledger"),
      import("../src/server/security/crypto"),
      import("../src/server/auth/line-linking"),
      import("../src/app/api/line-booking/member/route"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const ownerId = "33333333-3333-4333-8333-333333333301";
    const overrideId = await enableSyntheticMemberEntitlement(prisma, organizationId, ownerId);
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Wallet synthetic",
    }, select: { id: true } });
    const bookingToken = randomToken(32);
    const booking = await prisma.bookings.create({ data: {
      organization_id: organizationId, location_id: locationId,
      customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 10000,
      total_minor: 10000, tracking_token_hash: sha256(bookingToken), is_test: true,
    }, select: { id: true } });
    const payment = await prisma.booking_payments.create({ data: {
      organization_id: organizationId, location_id: locationId,
      booking_id: booking.id, method: "MANUAL_TRANSFER", status: "PAID",
      amount_minor: 10000, currency: "TWD", confirmed_by: ownerId,
      confirmed_at: new Date(),
    }, select: { id: true } });
    try {
      const topupKey = randomToken(24);
      const topup = await issueSyntheticWalletValue({ organizationId,
        customerId: customer.id, bookingPaymentId: payment.id,
        paidMinor: 10000, bonusMinor: 1000, idempotencyKey: topupKey });
      expect(await issueSyntheticWalletValue({ organizationId,
        customerId: customer.id, bookingPaymentId: payment.id,
        paidMinor: 10000, bonusMinor: 1000, idempotencyKey: topupKey })).toBe(topup);
      expect(await getWalletBalance(organizationId, customer.id))
        .toEqual({ paidMinor: 10000, bonusMinor: 1000, totalMinor: 11000 });
      const channelId = "synthetic-login-channel";
      await prisma.$executeRaw(Prisma.sql`
        insert into public.mobile_store_entries
          (organization_id, location_id, entry_slug, is_enabled)
        values (${organizationId}::uuid, ${locationId}::uuid,
          'synthetic-beauty-line', true)
        on conflict (organization_id, location_id)
        do update set is_enabled = true
      `);
      await prisma.$executeRaw(Prisma.sql`
        insert into public.store_line_channels
          (organization_id, location_id, provider_id, channel_id, purpose, is_enabled)
        values (${organizationId}::uuid, ${locationId}::uuid,
          'synthetic-provider', ${channelId}, 'LOGIN', true)
        on conflict (organization_id, location_id, channel_id)
        do update set is_enabled = true, purpose = 'LOGIN'
      `);
      const identity = { providerId: "synthetic-provider", channelId,
        subject: `U-member-${randomToken(8)}` };
      const placeholder = await ensureCustomerLineLink({ organizationId, locationId,
        channelId, identity });
      const mobile = await createLineMobileSession({ organizationId, locationId,
        channelId, identity, deviceId: randomToken(16),
        origin: "http://localhost:45143" });
      const mobileSession = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        select id from public.line_mobile_sessions
        where token_hash = ${sha256(mobile.token)}
      `);
      await linkExistingCustomerByBooking({ organizationId, locationId,
        mobileSessionId: mobileSession[0].id, currentCustomerId: placeholder,
        trackingToken: bookingToken });
      const member = await getMember(new Request(
        "http://localhost:45143/api/line-booking/member?store=synthetic-beauty-line",
        { headers: { cookie: `beauty_line_session=${mobile.token}`,
          host: "localhost:45143" } }));
      expect(member.status).toBe(200);
      expect(await member.json()).toMatchObject({ visible: true,
        newIssuanceEnabled: false,
        balance: { paidMinor: 10000, bonusMinor: 1000 } });
      const first = await reserveEntitlement({ organizationId, customerId: customer.id,
        bookingId: booking.id, amountMinor: 1000, policy: "PAID_FIRST",
        idempotencyKey: randomToken(24) });
      expect(first.allocation).toEqual({ amountMinor: 1000, paidMinor: 1000,
        bonusMinor: 0, policy: "PAID_FIRST" });
      await redeemEntitlement({ organizationId, customerId: customer.id,
        reservationId: first.reservationId, qrToken: first.qrToken,
        idempotencyKey: randomToken(24) });
      const second = await reserveEntitlement({ organizationId, customerId: customer.id,
        bookingId: booking.id, amountMinor: 1000, policy: "PRO_RATA_10_1",
        idempotencyKey: randomToken(24) });
      expect(second.allocation).toEqual({ amountMinor: 1000, paidMinor: 909,
        bonusMinor: 91, policy: "PRO_RATA_10_1" });
      const redeemKey = randomToken(24);
      const redeemed = await redeemEntitlement({ organizationId, customerId: customer.id,
        reservationId: second.reservationId, qrToken: second.qrToken,
        idempotencyKey: redeemKey });
      expect((await redeemEntitlement({ organizationId, customerId: customer.id,
        reservationId: second.reservationId, qrToken: second.qrToken,
        idempotencyKey: redeemKey })).transactionId).toBe(redeemed.transactionId);
      await expect(redeemEntitlement({ organizationId, customerId: customer.id,
        reservationId: second.reservationId, qrToken: second.qrToken,
        idempotencyKey: randomToken(24) })).rejects.toMatchObject({ status: 409 });
      expect(await getWalletBalance(organizationId, customer.id))
        .toEqual({ paidMinor: 8091, bonusMinor: 909, totalMinor: 9000 });
      const attempts = await Promise.allSettled([0, 1].map(() =>
        reserveEntitlement({ organizationId, customerId: customer.id,
          bookingId: booking.id, amountMinor: 9000, policy: "PAID_FIRST",
          idempotencyKey: randomToken(24) })));
      expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const winner = attempts.find(result => result.status === "fulfilled");
      if (!winner || winner.status !== "fulfilled") throw new Error("No reservation won");
      await releaseReservation({ organizationId, customerId: customer.id,
        reservationId: winner.value.reservationId });
      await releaseReservation({ organizationId, customerId: customer.id,
        reservationId: winner.value.reservationId });
      const refund = await prisma.booking_refunds.create({ data: {
        organization_id: organizationId, booking_id: booking.id,
        booking_payment_id: payment.id, status: "CONFIRMED", amount_minor: 500,
        reason: "synthetic partial return", recorded_by: ownerId,
        confirmed_by: ownerId, confirmed_at: new Date(),
      }, select: { id: true } });
      const refunded = await refundSettlement({ organizationId,
        customerId: customer.id, originalTransactionId: redeemed.transactionId,
        bookingRefundId: refund.id, amountMinor: 500, idempotencyKey: randomToken(24) });
      expect({ paidMinor: refunded.paidMinor, bonusMinor: refunded.bonusMinor })
        .toEqual({ paidMinor: 454, bonusMinor: 46 });
      expect(await getWalletBalance(organizationId, customer.id))
        .toEqual({ paidMinor: 8545, bonusMinor: 955, totalMinor: 9500 });
      const cancelledBooking = await prisma.bookings.create({ data: {
        organization_id: organizationId, location_id: locationId,
        customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 100,
        total_minor: 100, tracking_token_hash: sha256(randomToken(32)), is_test: true,
      }, select: { id: true } });
      const heldForCancel = await reserveEntitlement({ organizationId,
        customerId: customer.id, bookingId: cancelledBooking.id,
        amountMinor: 100, policy: "PAID_FIRST", idempotencyKey: randomToken(24) });
      await prisma.bookings.update({ where: { id: cancelledBooking.id },
        data: { status: "CANCELLED", cancelled_at: new Date() } });
      const released = await prisma.$queryRaw<{ status: string }[]>(Prisma.sql`
        select status from public.member_wallet_reservations
        where id=${heldForCancel.reservationId}::uuid
      `);
      expect(released[0].status).toBe("RELEASED");
      expect(allocateTender(1000, 10000, 1000, "PRO_RATA_10_1"))
        .toMatchObject({ paidMinor: 909, bonusMinor: 91 });
      expect((await getWalletBalance("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", customer.id)).totalMinor)
        .toBe(0);
      await expect(prisma.$executeRaw(Prisma.sql`
        update public.member_wallet_entries set delta_minor = 999
        where transaction_id = ${topup}::uuid
      `)).rejects.toBeTruthy();
      const oldEnvironment = process.env.APP_ENV;
      process.env.APP_ENV = "production";
      try {
        await expect(reserveEntitlement({ organizationId, customerId: customer.id,
          bookingId: booking.id, amountMinor: 1, policy: "PAID_FIRST",
          idempotencyKey: randomToken(24) })).rejects.toMatchObject({ status: 503 });
      } finally {process.env.APP_ENV = oldEnvironment;}
    } finally {
      delete process.env.MEMBER_VALUE_TEST_ONLY;
      await prisma.organization_feature_overrides.delete({ where: { id: overrideId } });
    }
  }, 90_000,
);
