import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "runs customer change/cancel after receptionist entry and masks other beautician details",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { resolvePublicLocation }, { getPublicAvailability },
      { createBookingHold }, { reschedulePublicBooking, cancelPublicBookingByCustomer },
      { bookMobile }, { resolveVerifiedMobileActor }, { maskMobileAgenda },
      { randomToken, sha256 }, { addLocalDays, formatDateInTimeZone }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/public-booking/context"),
      import("../src/server/public-booking/availability"),
      import("../src/server/public-booking/hold"),
      import("../src/server/public-booking/booking"),
      import("../src/server/mobile/booking"),
      import("../src/server/auth/line-mobile-session"),
      import("../src/server/mobile/calendar-mapper"),
      import("../src/server/security/crypto"),
      import("../src/server/time/timezone"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const variantId = "66666666-6666-4666-8666-666666666611";
    const staffId = "44444444-4444-4444-8444-444444444401";
    const org = await prisma.organizations.findUniqueOrThrow({ where: {
      id: organizationId }, select: { slug: true } });
    const location = await prisma.locations.findUniqueOrThrow({ where: {
      id: locationId }, select: { slug: true } });
    const store = await resolvePublicLocation({ organizationSlug: org.slug,
      locationSlug: location.slug });
    const profile = await prisma.profiles.create({ data: {
      email: `reception-${randomToken(8).replace(/[^a-zA-Z0-9]/g,"r")}@example.test`,
      display_name: "Reception synthetic",
    }, select: { id: true } });
    await prisma.location_memberships.create({ data: {
      organization_id: organizationId, location_id: locationId,
      profile_id: profile.id, role: "FRONT_DESK", status: "ACTIVE",
    } });
    const actor = resolveVerifiedMobileActor({ sessionId: randomToken(16),
      organizationId, locationId, sessionExpiresAt: new Date(Date.now()+3600_000),
      sessionRevokedAt: null, linkRevokedAt: null, actorKind: "EMPLOYEE",
      profileId: profile.id, customerId: null, customerActive: false,
      profileActive: true, memberships: [{ role: "FRONT_DESK", organizationId,
        locationId, active: true, allLocations: false }] }, organizationId, locationId);
    expect(actor?.capabilities.has("booking.create")).toBe(true);
    const token = randomToken(32);
    const session = await prisma.public_booking_sessions.create({ data: {
      organization_id: organizationId, location_id: locationId,
      token_hash: sha256(token), expires_at: new Date(Date.now()+30*60_000),
      ip_hash: sha256("synthetic-reception-ip"), device_hash: sha256(randomToken(16)),
      behavior_hash: sha256("reception-test"), allowed_origin: "http://127.0.0.1:45143",
    }, select: { id: true } });
    const context = { ...store, sessionId: session.id, sessionToken: token,
      requestId: randomToken(12) };
    const today = formatDateInTimeZone(new Date(),store.timezone);
    let slots: Array<{ startsAt: string; availableStaff: string[] }> = [];
    for (let offset = 1; offset <= 14 && slots.length < 2; offset++) {
      const availability = await getPublicAvailability(context, {
        serviceVariantId: variantId, staffProfileId: staffId,
        date: addLocalDays(today,offset) });
      slots = availability.slots.filter(row => row.availableStaff.includes(staffId));
    }
    expect(slots.length).toBeGreaterThan(1);
    const phone = `09${Math.floor(10000000+Math.random()*90000000)}`;
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Reception customer",
      deposit_mode: "EXEMPT", customer_contacts: { create: {
        contact_type: "PHONE", value: phone, normalized_value: `+886${phone.slice(1)}`,
        is_primary: true } },
    }, select: { id: true } });
    const made = await bookMobile({ actor: actor!, context,
      serviceVariantId: variantId, staffProfileId: staffId,
      startsAt: slots[0].startsAt, name: "Reception customer", phone,
      source: "phone", idempotencyKey: randomToken(24) });
    const booking = await prisma.bookings.findUniqueOrThrow({ where: { id: made.id },
      select: { customer_id: true, source: true } });
    expect(booking).toMatchObject({ customer_id: customer.id, source: "PHONE" });
    const entry = { id: made.id, staffId, start: made.start,
      finish: new Date(Date.parse(made.start)+3600_000).toISOString(),
      customerName: "Reception customer", phone, serviceName: "Synthetic",
      staffName: "Staff A", source: "PHONE" };
    expect(maskMobileAgenda([entry], true, null)[0].customer_name).toBe("Reception customer");
    expect(maskMobileAgenda([entry], false,
      "44444444-4444-4444-8444-444444444402")[0])
      .toMatchObject({ busy: true, staff_id: staffId });
    expect(maskMobileAgenda([entry], false, staffId)[0].customer_name)
      .toBe("Reception customer");
    let laterStart: string | undefined;
    for (let offset = 1; offset <= 14 && !laterStart; offset++) {
      const later = await getPublicAvailability(context, {
        serviceVariantId: variantId, staffProfileId: staffId,
        date: addLocalDays(today, offset) });
      laterStart = later.slots.find(row => row.availableStaff.includes(staffId) &&
        Date.parse(row.startsAt) >= Date.parse(made.start)+90*60_000)?.startsAt;
    }
    expect(laterStart).toBeTruthy();
    const changeKey = randomToken(24);
    const hold = await createBookingHold({ context, serviceVariantId: variantId,
      staffProfileId: staffId, startsAt: laterStart!,
      idempotencyKey: changeKey });
    const changed = await reschedulePublicBooking({ context,
      authorizedBooking: { id: made.id, customerId: customer.id },
      holdToken: hold.holdToken, idempotencyKey: changeKey,
      keepSessionActive: true });
    expect(changed.booking.id).not.toBe(made.id);
    const cancelled = await cancelPublicBookingByCustomer({
      organizationId, locationId, bookingId: changed.booking.id,
      customerId: customer.id, reason: "Synthetic customer cancellation",
      requestId: randomToken(12) });
    expect(cancelled.status).toBe("CANCELLED");
  }, 60_000);
