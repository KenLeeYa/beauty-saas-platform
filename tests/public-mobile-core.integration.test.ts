import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

import type { VerifiedMobileActor } from "../src/server/auth/line-mobile-session";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "public and mobile bookings compete for the same staff and resource allocation",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { resolvePublicLocation }, { getPublicAvailability },
      { createBookingHold }, { confirmPublicBooking, cancelPublicBookingByCustomer, reschedulePublicBooking },
      { bookMobile }, { randomToken, sha256 },
      { addLocalDays, formatDateInTimeZone }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/public-booking/context"),
      import("../src/server/public-booking/availability"),
      import("../src/server/public-booking/hold"),
      import("../src/server/public-booking/booking"),
      import("../src/server/mobile/booking"),
      import("../src/server/security/crypto"),
      import("../src/server/time/timezone"),
    ]);
    const organization = await prisma.organizations.findUniqueOrThrow({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      select: { slug: true, locations: { where: { id: "22222222-2222-4222-8222-222222222221" },
        select: { slug: true } } },
    });
    const store = await resolvePublicLocation({ organizationSlug: organization.slug,
      locationSlug: organization.locations[0].slug });
    const variantId = "66666666-6666-4666-8666-666666666611";
    const staffId = "44444444-4444-4444-8444-444444444401";
    const nowDate = formatDateInTimeZone(new Date(), store.timezone);
    let startsAt: string | undefined;
    for (let offset = 1; offset <= 14 && !startsAt; offset++) {
      const date = addLocalDays(nowDate, offset);
      const candidate = await getPublicAvailability({ ...store, sessionId: "00000000-0000-4000-8000-000000000000",
        sessionToken: "temporary-query-token", requestId: "integration-query" },
      { serviceVariantId: variantId, staffProfileId: staffId, date });
      startsAt = candidate.slots.find((slot) => slot.availableStaff.includes(staffId))?.startsAt;
    }
    expect(startsAt, "seeded store needs a future open slot").toBeTruthy();
    const makeContext = async () => {
      const token = randomToken(32);
      const row = await prisma.public_booking_sessions.create({ data: {
        organization_id: store.organizationId, location_id: store.locationId,
        token_hash: sha256(token), expires_at: new Date(Date.now() + 30 * 60_000),
        ip_hash: sha256("synthetic-ip"), device_hash: sha256(randomToken(16)),
        behavior_hash: sha256("integration-test"), allowed_origin: "http://127.0.0.1:45143",
      }, select: { id: true } });
      return { ...store, sessionId: row.id, sessionToken: token, requestId: randomToken(12) };
    };
    const [publicContext, mobileContext] = await Promise.all([makeContext(), makeContext()]);
    const actor: VerifiedMobileActor = { kind: "employee", sessionId: randomToken(16),
      organizationId: store.organizationId, locationId: store.locationId,
      profileId: "33333333-3333-4333-8333-333333333304", customerId: null,
      capabilities: new Set(["booking.create"]) };
    const publicKey = randomToken(24), mobileKey = randomToken(24);
    const phone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    await prisma.customers.create({data:{organization_id:store.organizationId,
      display_name:"Synthetic race",deposit_mode:"EXEMPT",
      customer_contacts:{create:{contact_type:"PHONE",value:phone,
        normalized_value:`+886${phone.slice(1)}`,is_primary:true}}}});
    const [publicAttempt, mobileAttempt] = await Promise.allSettled([
      createBookingHold({ context: publicContext, serviceVariantId: variantId,
        staffProfileId: staffId, startsAt: startsAt!, idempotencyKey: publicKey }),
      bookMobile({ actor, context: mobileContext, serviceVariantId: variantId,
        staffProfileId: staffId, startsAt: startsAt!, name: "Synthetic race", phone,
        source: "phone", idempotencyKey: mobileKey }),
    ]);
    expect([publicAttempt, mobileAttempt].filter((result) => result.status === "fulfilled")).toHaveLength(1);
    let bookingId: string;
    let expectedSource: "ONLINE" | "PHONE";
    if (publicAttempt.status === "fulfilled") {
      const confirmed = await confirmPublicBooking({ context: publicContext, idempotencyKey: publicKey,
        payload: { holdToken: publicAttempt.value.holdToken,
          customer: { displayName: "Synthetic race", phone },
          consents: { service: true, marketing: false } } });
      expect(confirmed.booking.id).toBeTruthy();
      bookingId = confirmed.booking.id;
      expectedSource = "ONLINE";
    } else if (mobileAttempt.status === "fulfilled") {
      const retry = await bookMobile({ actor, context: mobileContext, serviceVariantId: variantId,
        staffProfileId: staffId, startsAt: startsAt!, name: "Synthetic race", phone,
        source: "phone", idempotencyKey: mobileKey });
      expect(retry.id).toBe(mobileAttempt.value.id);
      bookingId = retry.id;
      expectedSource = "PHONE";
    } else {
      throw new Error("Neither booking entry acquired capacity");
    }
    const booking = await prisma.bookings.findUniqueOrThrow({ where: { id: bookingId },
      select: { source: true, customer_id: true, status: true } });
    expect(booking.source).toBe(expectedSource);
    expect(await prisma.booking_staff_allocations.count({ where: { booking_id: bookingId } })).toBe(1);
    expect(await prisma.notification_outbox.count({ where: { booking_id: bookingId } })).toBe(1);
    await expect(cancelPublicBookingByCustomer({bookingId,
      organizationId:store.organizationId,locationId:store.locationId,
      customerId:"00000000-0000-4000-8000-000000000001",reason:"wrong actor",
      requestId:randomToken(12)})).rejects.toMatchObject({status:404});
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:bookingId}})).status).toBe(booking.status);

    const laterDate=addLocalDays(formatDateInTimeZone(new Date(startsAt!),store.timezone),1);
    const later=await getPublicAvailability(mobileContext,{serviceVariantId:variantId,
      staffProfileId:staffId,date:laterDate});
    const newStart=later.slots.find(slot=>slot.availableStaff.includes(staffId))?.startsAt;
    expect(newStart,"seeded store needs a later free slot").toBeTruthy();
    const changeKey=randomToken(24);
    const changeHold=await createBookingHold({context:mobileContext,
      serviceVariantId:variantId,staffProfileId:staffId,startsAt:newStart!,idempotencyKey:changeKey});
    await expect(reschedulePublicBooking({context:mobileContext,
      authorizedBooking:{id:bookingId,customerId:"00000000-0000-4000-8000-000000000001"},
      holdToken:changeHold.holdToken,idempotencyKey:changeKey})).rejects.toMatchObject({status:404});
    let changed;
    try {
      changed=await reschedulePublicBooking({context:mobileContext,
        authorizedBooking:{id:bookingId,customerId:booking.customer_id},
        holdToken:changeHold.holdToken,idempotencyKey:changeKey,keepSessionActive:true});
    } catch(error) {
      const holdState=await prisma.booking_holds.findUnique({where:{token_hash:sha256(changeHold.holdToken)},
        select:{status:true,expires_at:true,public_booking_session_id:true,service_variant_id:true}});
      const originalState=await prisma.booking_segments.findFirst({where:{booking_id:bookingId},
        select:{service_variant_id:true}});
      const publicSession=await prisma.public_booking_sessions.findUnique({where:{id:mobileContext.sessionId},select:{status:true,expires_at:true}});
      throw new Error(`reschedule failed: ${error instanceof Error?error.message:String(error)}; hold=${holdState?.status}; fresh=${Boolean(holdState&&holdState.expires_at>new Date())}; session=${holdState?.public_booking_session_id===mobileContext.sessionId}; variant=${holdState?.service_variant_id===originalState?.service_variant_id}; publicSession=${publicSession?.status}; publicFresh=${Boolean(publicSession&&publicSession.expires_at>new Date())}`);
    }
    expect(changed.booking.id).not.toBe(bookingId);
    const cancelled=await cancelPublicBookingByCustomer({bookingId:changed.booking.id,
      organizationId:store.organizationId,locationId:store.locationId,
      customerId:booking.customer_id,reason:"synthetic test",requestId:randomToken(12)});
    expect(cancelled.status).toBe("CANCELLED");
    const cancellationOutbox=await prisma.notification_outbox.count({where:{booking_id:changed.booking.id}});
    await cancelPublicBookingByCustomer({bookingId:changed.booking.id,
      organizationId:store.organizationId,locationId:store.locationId,
      customerId:booking.customer_id,reason:"synthetic retry",requestId:randomToken(12)});
    expect(await prisma.notification_outbox.count({where:{booking_id:changed.booking.id}})).toBe(cancellationOutbox);
  }, 60_000,
);
