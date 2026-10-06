import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

import type { VerifiedMobileActor } from "../src/server/auth/line-mobile-session";
import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "keeps the booking and old allocation until a qualified replacement succeeds",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { resolvePublicLocation }, { getPublicAvailability },
      { bookMobile }, { listAtRiskFutureBookings, reassignFutureBooking },
      { randomToken, sha256 }, { addLocalDays, formatDateInTimeZone }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/public-booking/context"),
      import("../src/server/public-booking/availability"),
      import("../src/server/mobile/booking"),
      import("../src/server/booking/reassignment"),
      import("../src/server/security/crypto"),
      import("../src/server/time/timezone"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const variantId = "66666666-6666-4666-8666-666666666611";
    const organization = await prisma.organizations.findUniqueOrThrow({
      where: { id: organizationId }, select: { slug: true, name: true, status: true } });
    const location = await prisma.locations.findUniqueOrThrow({
      where: { id: locationId }, select: { slug: true, name: true, timezone: true } });
    const store = await resolvePublicLocation({ organizationSlug: organization.slug,
      locationSlug: location.slug });
    const today = formatDateInTimeZone(new Date(), store.timezone);
    let start = "", oldStaff = "", targetStaff = "";
    for (let offset = 1; offset <= 14 && !start; offset++) {
      const result = await getPublicAvailability({ ...store,
        sessionId: "00000000-0000-4000-8000-000000000000", sessionToken: "query",
        requestId: "query" }, { serviceVariantId: variantId,
        date: addLocalDays(today, offset) });
      const slot = result.slots.find(item => item.availableStaff.length >= 2);
      if (slot) { start = slot.startsAt; [oldStaff, targetStaff] = slot.availableStaff; }
    }
    expect(start, "seeded store needs two qualified staff at one slot").toBeTruthy();
    const token = randomToken(32);
    const session = await prisma.public_booking_sessions.create({ data: {
      organization_id: organizationId, location_id: locationId,
      token_hash: sha256(token), expires_at: new Date(Date.now()+30*60_000),
      ip_hash: sha256("synthetic-ip"), device_hash: sha256(randomToken(16)),
      behavior_hash: sha256("reassign"), allowed_origin: "http://localhost:45143",
    }, select: { id: true } });
    const actor: VerifiedMobileActor = { kind: "employee", sessionId: randomToken(16),
      organizationId, locationId, profileId: "33333333-3333-4333-8333-333333333304",
      customerId: null, capabilities: new Set(["booking.create"]) };
    const booked = await bookMobile({ actor, context: { ...store, sessionId: session.id,
      sessionToken: token, requestId: randomToken(12) }, serviceVariantId: variantId,
      staffProfileId: oldStaff, startsAt: start, name: "Reassign synthetic",
      phone: `09${Math.floor(10000000+Math.random()*90000000)}`,
      source: "phone", idempotencyKey: randomToken(24) });
    const manager: OrganizationContext = { session: { id: randomToken(16),
      profileId: "33333333-3333-4333-8333-333333333301", email: "owner@example.test",
      displayName: "Owner", platformRole: null, expiresAt: new Date(Date.now()+60_000),
      csrfTokenHash: "" }, organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationId]),
      linkedStaffProfileId: null };
    const pending = await listAtRiskFutureBookings(manager, oldStaff);
    expect(pending.some(row => row.id === booked.id)).toBe(true);
    await expect(reassignFutureBooking({ context: { ...manager,
      roles: new Set(["SERVICE_PROVIDER"]) }, bookingId: booked.id,
      targetStaffId: targetStaff, reason: "synthetic", requestId: randomToken(12) }))
      .rejects.toMatchObject({ status: 403 });
    const allocation = await prisma.booking_staff_allocations.findFirstOrThrow({
      where: { booking_id: booked.id, is_blocking: true },
      select: { starts_at: true, ends_at: true } });
    const leave = await prisma.staff_time_off.create({ data: {
      organization_id: organizationId, location_id: locationId,
      staff_profile_id: targetStaff, starts_at: allocation.starts_at,
      ends_at: allocation.ends_at, reason: "synthetic leave",
    }, select: { id: true } });
    try {
      await expect(reassignFutureBooking({ context: manager, bookingId: booked.id,
        targetStaffId: targetStaff, reason: "synthetic", requestId: randomToken(12) }))
        .rejects.toMatchObject({ status: 409 });
      expect((await prisma.booking_segments.findFirstOrThrow({ where: {
        booking_id: booked.id } })).assigned_staff_id).toBe(oldStaff);
    } finally { await prisma.staff_time_off.delete({ where: { id: leave.id } }); }
    await reassignFutureBooking({ context: manager, bookingId: booked.id,
      targetStaffId: targetStaff, reason: "synthetic reassignment",
      requestId: randomToken(12) });
    expect((await prisma.booking_segments.findFirstOrThrow({ where: {
      booking_id: booked.id } })).assigned_staff_id).toBe(targetStaff);
    const allocations = await prisma.booking_staff_allocations.findMany({ where: {
      booking_id: booked.id, is_blocking: true } });
    expect(allocations.map(row => row.staff_profile_id)).toEqual([targetStaff]);
    expect(await prisma.notification_outbox.count({ where: { booking_id: booked.id,
      event_type: "BOOKING_RESCHEDULED" } })).toBe(1);
  }, 60_000,
);
