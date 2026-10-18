import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";
import { chromium } from "@playwright/test";

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
    const { listQualificationReviews, findQualificationReviews } = await import("../src/server/booking/qualification-review");
    const { setStaffCapability } = await import("../src/server/staff/service-capability");
    const assignment = await prisma.service_staff_assignments.findFirstOrThrow({ where: {
      organization_id: organizationId, staff_profile_id: oldStaff,
      location_services: { location_id: locationId, service_variant_id: variantId },
    } });
    const originalTerms = { effectiveFrom: assignment.effective_from,
      effectiveUntil: assignment.effective_until, onlineSelectable: assignment.online_booking_enabled,
      walkInEligible: assignment.walk_in_eligible };
    const change = (effectiveUntil: Date | null) => setStaffCapability({ context: manager,
      assignmentId: assignment.id, ...originalTerms, effectiveUntil, reason: "Synthetic qualification review" });
    const reviews = () => listQualificationReviews(manager);
    expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(false);
    try {
      await setStaffCapability({ context: manager, assignmentId: assignment.id, ...originalTerms,
        onlineSelectable: false, walkInEligible: false, reason: "Only close new intake" });
      expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(false);
      await change(new Date(new Date(start).getTime() + 1));
      expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(false);
      expect((await change(new Date(start))).pendingReviewCount).toBeGreaterThan(0);
      await change(new Date(start));
      expect((await reviews()).items.filter(row => row.bookingId === booked.id)).toHaveLength(1);
      await expect(prisma.$transaction(async transaction => {
        await transaction.$executeRaw`
          insert into public.booking_segments
          select (jsonb_populate_record(null::public.booking_segments,
            to_jsonb(segment) || jsonb_build_object('id', gen_random_uuid(),
              'sort_order', series, 'starts_at', segment.starts_at + series * interval '1 second',
              'ends_at', segment.ends_at + series * interval '1 second'))).*
          from public.booking_segments segment cross join generate_series(100, 150) series
          where segment.booking_id = ${booked.id}::uuid
        `;
        const first = await findQualificationReviews(transaction, manager);
        const second = await findQualificationReviews(transaction, manager, { offset: 50 });
        expect(first.items).toHaveLength(50);
        expect(first.total).toBeGreaterThanOrEqual(52);
        expect(second.total).toBe(first.total);
        const emptyPage = await findQualificationReviews(transaction, manager, { offset: 100000 });
        expect(emptyPage.items).toEqual([]);
        expect(emptyPage.total).toBe(first.total);
        expect(second.items.length).toBeGreaterThan(0);
        expect(first.items.some(row => second.items.some(other => other.segmentId === row.segmentId))).toBe(false);
        expect(first.items.find(row => row.bookingId === booked.id)?.canReassign).toBe(false);
        throw Error("rollback pagination fixture");
      })).rejects.toThrow("rollback pagination fixture");
      expect((await prisma.booking_segments.findFirstOrThrow({ where: { booking_id: booked.id } })).assigned_staff_id).toBe(oldStaff);
      await expect(listQualificationReviews({ ...manager, roles: new Set(["SERVICE_PROVIDER"]) }))
        .rejects.toMatchObject({ status: 403 });
      expect((await listQualificationReviews({ ...manager, location: { ...manager.location!,
        id: "22222222-2222-4222-8222-222222222222" } })).items.some(row => row.bookingId === booked.id)).toBe(false);
      expect((await listQualificationReviews({ ...manager, organization: { ...manager.organization,
        id: "11111111-1111-4111-8111-111111111112" } })).items).toEqual([]);
      await expect(setStaffCapability({ context: { ...manager, location: { ...manager.location!,
        id: "22222222-2222-4222-8222-222222222222" } }, assignmentId: assignment.id,
        ...originalTerms, reason: "Wrong branch" })).rejects.toMatchObject({ status: 404 });
      await expect(prisma.$transaction(async transaction => {
        await transaction.bookings.update({ where: { id: booked.id }, data: { status: "CANCELLED" } });
        expect((await findQualificationReviews(transaction, manager)).items.some(row => row.bookingId === booked.id)).toBe(false);
        throw Error("rollback cancellation fixture");
      })).rejects.toThrow("rollback cancellation fixture");
      await change(originalTerms.effectiveUntil);
      expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(false);
      await setStaffCapability({ context: manager, assignmentId: assignment.id, ...originalTerms,
        effectiveFrom: new Date(new Date(start).getTime() + 1), effectiveUntil: null,
        reason: "Qualification begins after booking" });
      expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(true);
      await change(new Date(start));
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
      expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(true);
    } finally { await prisma.staff_time_off.delete({ where: { id: leave.id } }); }
    const queued = (await reviews()).items.find(row => row.bookingId === booked.id)!;
    await expect(reassignFutureBooking({ context: manager, bookingId: booked.id,
      targetStaffId: targetStaff, reason: "stale review", expectedVersion: queued.bookingVersion + 1,
      requestId: randomToken(12) })).rejects.toMatchObject({ status: 409 });
    if (process.env.UNIFIED_UI_TEST_URL) {
      const { createApplicationSession } = await import("../src/server/auth/session");
      const material = await createApplicationSession({ profileId: manager.session.profileId });
      const base = process.env.UNIFIED_UI_TEST_URL;
      const browser = await chromium.launch({ executablePath:
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
      try {
        const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await browserContext.addCookies([
          { name: "beauty_session", value: material.sessionToken, url: base },
          { name: "beauty_csrf", value: material.csrfToken, url: base },
        ]);
        const scope = new URLSearchParams({ organization: organization.slug, location: location.slug });
        const capabilityUrl = `${base}/api/merchant/staff/capabilities?${scope}`;
        const response = await browserContext.request.patch(capabilityUrl, {
          headers: { origin: base, "x-csrf-token": material.csrfToken }, data: {
            assignmentId: assignment.id, ...originalTerms, effectiveUntil: start,
            reason: "Synthetic HTTP qualification change" },
        });
        expect(response.status()).toBe(200);
        expect((await response.json()).data.pendingReviewCount).toBeGreaterThan(0);
        const page = await browserContext.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base}/merchant/operations?${scope}`);
        await page.getByRole("button", { name: "預約改派", exact: true }).click();
        const panel = page.getByLabel("資格異動待處理預約", { exact: true });
        const row = panel.locator(`li[data-segment-id="${queued.segmentId}"]`);
        await row.getByRole("button", { name: "選擇改派人員" }).click();
        await panel.getByLabel("改派美容師").selectOption(targetStaff);
        await panel.getByLabel("改派原因").fill("Synthetic browser confirmed reassignment");
        expect(await page.locator("html").evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: ".dev-logs/qualification-review-mobile.png", fullPage: true });
        const saved = page.waitForResponse(response => response.url().includes("/bookings/reassign") &&
          response.request().method() === "PATCH");
        await panel.getByRole("button", { name: "確認改派", exact: true }).click();
        expect((await saved).status()).toBe(200);
        await panel.getByRole("status").filter({ hasText: "已確認改派" }).waitFor();
        await row.waitFor({ state: "detached" });
        await page.reload();
        await page.getByRole("button", { name: "預約改派", exact: true }).click();
        await panel.getByRole("heading", { name: /資格異動待處理 \(/ }).waitFor();
        expect(await row.count()).toBe(0);
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    } else {
      const attempts = await Promise.allSettled([1, 2].map(() => reassignFutureBooking({ context: manager, bookingId: booked.id,
        targetStaffId: targetStaff, reason: "synthetic reassignment", expectedVersion: queued.bookingVersion,
        requestId: randomToken(12) })));
      expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(attempts.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    }
    expect((await reviews()).items.some(row => row.bookingId === booked.id)).toBe(false);
    await expect(reassignFutureBooking({ context: manager, bookingId: booked.id,
      targetStaffId: targetStaff, reason: "duplicate stale confirmation", expectedVersion: queued.bookingVersion,
      requestId: randomToken(12) })).rejects.toMatchObject({ status: 409 });
    expect((await prisma.booking_segments.findFirstOrThrow({ where: {
      booking_id: booked.id } })).assigned_staff_id).toBe(targetStaff);
    const allocations = await prisma.booking_staff_allocations.findMany({ where: {
      booking_id: booked.id, is_blocking: true } });
    expect(allocations.map(row => row.staff_profile_id)).toEqual([targetStaff]);
    expect(await prisma.notification_outbox.count({ where: { booking_id: booked.id,
      event_type: "BOOKING_RESCHEDULED" } })).toBe(1);
    } finally {
      await setStaffCapability({ context: manager, assignmentId: assignment.id,
        ...originalTerms, reason: "Restore synthetic qualification" });
    }
  }, 60_000,
);
