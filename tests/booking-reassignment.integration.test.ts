import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";
import { chromium, type Locator, type Page } from "@playwright/test";

import type { VerifiedMobileActor } from "../src/server/auth/line-mobile-session";
import type { OrganizationContext } from "../src/server/authorization/context";

// Model a keyboard that resizes/pans only VisualViewport, not the CSS layout viewport.
async function keyboardViewport(page: Page, height: number | null, offsetTop = 0) {
  await page.evaluate(({ height, offsetTop }) => {
    const viewport = window.visualViewport!;
    if (height === null) {
      Reflect.deleteProperty(viewport, "height");
      Reflect.deleteProperty(viewport, "offsetTop");
    } else {
      Object.defineProperties(viewport, {
        height: { configurable: true, value: height },
        offsetTop: { configurable: true, value: offsetTop },
      });
    }
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  }, { height, offsetTop });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function expectKeyboardControls(dialog: Locator, fieldName = "改派原因") {
  for (const control of [dialog.getByLabel(fieldName), dialog.getByRole("button", { name: "確認改派", exact: true })]) {
    expect(await control.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const viewport = window.visualViewport!;
      const body = element.closest("form")!.querySelector("textarea")!.closest("label")!.parentElement!.parentElement!;
      const bodyBounds = body.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return bounds.top >= viewport.offsetTop && bounds.bottom <= viewport.offsetTop + viewport.height + 1 &&
        (element.tagName === "BUTTON" || (bounds.top >= bodyBounds.top && bounds.bottom <= bodyBounds.bottom + 1)) &&
        !!hit && element.contains(hit);
    }), "focused input and confirm must be visible, unclipped and hit-testable above the keyboard").toBe(true);
  }
}

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
        expect(first.items.filter(row => row.bookingId === booked.id && !row.allocationId)
          .every(row => !row.canReassign)).toBe(true);
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
        const dialog = page.getByRole("dialog", { name: "改派預約", exact: true });
        await dialog.getByLabel("改派美容師").selectOption(targetStaff);
        await dialog.getByLabel("改派原因").fill("Synthetic browser confirmed reassignment");
        expect(await page.locator("html").evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: ".dev-logs/qualification-review-mobile.png", fullPage: true });
        const saved = page.waitForResponse(response => response.url().includes("/bookings/reassign") &&
          response.request().method() === "PATCH");
        await dialog.getByRole("button", { name: "確認改派", exact: true }).click();
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

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("reassigns one participant across bundled services without changing retained arrangements", async () => {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../src/server/database/prisma");
  const { reassignFutureBooking } = await import("../src/server/booking/reassignment");
  const { listQualificationReviews } = await import("../src/server/booking/qualification-review");
  const { setStaffCapability } = await import("../src/server/staff/service-capability");
  const { randomToken, sha256 } = await import("../src/server/security/crypto");
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const locationId = "22222222-2222-4222-8222-222222222221";
  const organization = await prisma.organizations.findUniqueOrThrow({ where: { id: organizationId } });
  const location = await prisma.locations.findUniqueOrThrow({ where: { id: locationId } });
  const customer = await prisma.customers.findFirstOrThrow({ where: { organization_id: organizationId } });
  const services = await prisma.location_services.findMany({ where: { organization_id: organizationId,
    location_id: locationId, is_active: true }, take: 2 });
  expect(services).toHaveLength(2);
  const context: OrganizationContext = { session: { id: randomToken(16),
    profileId: "33333333-3333-4333-8333-333333333301", email: "owner@example.test",
    displayName: "Owner", platformRole: null, expiresAt: new Date(Date.now()+60000), csrfTokenHash: "" },
    organization, location, roles: new Set(["ORGANIZATION_OWNER"]), allLocations: true,
    accessibleLocationIds: new Set([locationId]), linkedStaffProfileId: null };
  const staff = [];
  for (const label of ["Primary", "Partner", "Replacement"]) {
    const person = await prisma.staff_profiles.create({ data: { organization_id: organizationId,
      display_name: `Bundle QA ${label} ${randomToken(4)}`, public_visible: false } });
    staff.push(person);
    await prisma.staff_location_assignments.create({ data: { organization_id: organizationId,
      location_id: locationId, staff_profile_id: person.id } });
    await prisma.staff_availability_rules.createMany({ data: Array.from({ length: 7 }, (_, day) => ({
      organization_id: organizationId, location_id: locationId, staff_profile_id: person.id,
      day_of_week: day, starts_at: new Date("1970-01-01T00:00:00Z"), ends_at: new Date("1970-01-01T23:59:00Z"),
    })) });
    await prisma.service_staff_assignments.createMany({ data: services.map(service => ({
      organization_id: organizationId, location_service_id: service.id, staff_profile_id: person.id,
    })) });
  }
  const [primary, partner, replacement] = staff;
  const resourceType = await prisma.resource_types.findFirstOrThrow({ where: { organization_id: organizationId } });
  const resource = await prisma.resources.create({ data: { organization_id: organizationId, location_id: locationId,
    resource_type_id: resourceType.id, name: `Bundle QA resource ${randomToken(6)}` } });
  const start = new Date(Date.now()+3*86400000); start.setUTCHours(3, 0, 0, 0);
  const booking = await prisma.bookings.create({ data: { organization_id: organizationId,
    location_id: locationId, customer_id: customer.id, status: "CONFIRMED", subtotal_minor: 200000,
    discount_minor: 10000, total_minor: 190000, deposit_required_minor: 20000,
    policy_snapshot: { synthetic: "retained terms" }, tracking_token_hash: sha256(randomToken(32)), is_test: true } });
  const segments = [];
  for (let index = 0; index < 2; index++) {
    const startsAt = new Date(start.getTime()+index*2*3600000);
    const endsAt = new Date(startsAt.getTime()+3600000);
    const segment = await prisma.booking_segments.create({ data: { organization_id: organizationId,
      location_id: locationId, booking_id: booking.id, service_variant_id: services[index].service_variant_id,
      assigned_staff_id: primary.id, staff_name_snapshot: primary.display_name,
      service_name_snapshot: `Bundle service ${index+1}`, variant_name_snapshot: `Variant ${index+1}`,
      starts_at: startsAt, ends_at: endsAt, duration_minutes: 60, price_minor: 100000,
      pre_buffer_minutes: 5, post_buffer_minutes: 10, sort_order: index } });
    segments.push(segment);
    await prisma.booking_resource_allocations.create({ data: { organization_id: organizationId,
      location_id: locationId, booking_id: booking.id, booking_segment_id: segment.id, resource_id: resource.id,
      starts_at: startsAt, ends_at: endsAt } });
    await prisma.booking_staff_allocations.createMany({ data: [primary, partner].map(person => ({
      organization_id: organizationId, location_id: locationId, booking_id: booking.id,
      booking_segment_id: segment.id, staff_profile_id: person.id,
      starts_at: new Date(startsAt.getTime()-300000), ends_at: new Date(endsAt.getTime()+600000),
    })) });
  }
  await prisma.$executeRaw`insert into public.booking_dispatch_claims
    (organization_id, location_id, service_variant_id, staff_profile_id, booking_id,
      idempotency_hash, mode, starts_at, status, expires_at)
    values (${organizationId}::uuid, ${locationId}::uuid, ${services[1].service_variant_id}::uuid,
      ${primary.id}::uuid, ${booking.id}::uuid, ${sha256(randomToken(32))}, 'IMMEDIATE',
      ${segments[1].starts_at}, 'CONFIRMED', ${segments[1].ends_at})`;
  const snapshot = () => prisma.bookings.findUniqueOrThrow({ where: { id: booking.id }, include: {
    booking_segments: { orderBy: { sort_order: "asc" } }, booking_staff_allocations: { orderBy: { id: "asc" } },
    booking_resource_allocations: true } });
  const before = await snapshot();
  try {
    for (const service of services) {
      const assignment = await prisma.service_staff_assignments.findFirstOrThrow({ where: {
        location_service_id: service.id, staff_profile_id: partner.id } });
      await setStaffCapability({ context, assignmentId: assignment.id,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"), effectiveUntil: start,
        onlineSelectable: true, walkInEligible: true, reason: "Synthetic partner qualification expired" });
    }
    const pending = (await listQualificationReviews(context)).items.filter(row => row.bookingId === booking.id);
    expect(pending).toHaveLength(2);
    expect(pending.every(row => row.staffId === partner.id && row.canReassign)).toBe(true);
    const selected = pending.find(row => row.segmentId === segments[0].id)!;
    const command = { context, bookingId: booking.id, segmentId: selected.segmentId,
      allocationId: selected.allocationId!, expectedVersion: selected.bookingVersion,
      targetStaffId: replacement.id, reason: "Replace only selected partner", requestId: randomToken(12) };
    await expect(reassignFutureBooking({ ...command, expectedVersion: undefined })).rejects.toMatchObject({ status: 400 });
    await expect(reassignFutureBooking({ ...command, segmentId: undefined, allocationId: undefined }))
      .rejects.toMatchObject({ status: 409 });
    await expect(reassignFutureBooking({ ...command, context: { ...context, organization: { ...organization,
      id: "11111111-1111-4111-8111-111111111112" } } })).rejects.toMatchObject({ status: 404 });
    await expect(reassignFutureBooking({ ...command, allocationId: before.booking_staff_allocations
      .find(row => row.booking_segment_id === segments[1].id)!.id })).rejects.toMatchObject({ status: 409 });
    await expect(reassignFutureBooking({ ...command, targetStaffId: primary.id })).rejects.toMatchObject({ status: 409 });
    await expect(reassignFutureBooking({ ...command, context: { ...context,
      roles: new Set(["SERVICE_PROVIDER"]) } })).rejects.toMatchObject({ status: 403 });
    await expect(reassignFutureBooking({ ...command, context: { ...context, location: { ...location,
      id: "22222222-2222-4222-8222-222222222222" } } })).rejects.toMatchObject({ status: 404 });
    expect(await snapshot()).toEqual(before);
    const occupied = await prisma.booking_staff_allocations.create({ data: { organization_id: organizationId,
      location_id: locationId, booking_id: booking.id, booking_segment_id: segments[1].id,
      staff_profile_id: replacement.id, starts_at: segments[0].starts_at, ends_at: segments[0].ends_at } });
    try {
      await expect(reassignFutureBooking(command)).rejects.toBeDefined();
      expect((await snapshot()).booking_staff_allocations.filter(row => row.id !== occupied.id))
        .toEqual(before.booking_staff_allocations);
      expect(await prisma.booking_events.count({ where: { booking_id: booking.id, event_type: "STAFF_REASSIGNED" } })).toBe(0);
    } finally { await prisma.booking_staff_allocations.delete({ where: { id: occupied.id } }); }
    if (process.env.UNIFIED_UI_TEST_URL) {
      const { createApplicationSession } = await import("../src/server/auth/session");
      const material = await createApplicationSession({ profileId: context.session.profileId });
      const base = process.env.UNIFIED_UI_TEST_URL;
      const browser = await chromium.launch({ executablePath:
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
      try {
        const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await browserContext.addCookies([{ name: "beauty_session", value: material.sessionToken, url: base },
          { name: "beauty_csrf", value: material.csrfToken, url: base }]);
        const page = await browserContext.newPage();
        const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base}/merchant/operations?organization=${organization.slug}&location=${location.slug}`);
        await page.getByRole("button", { name: "預約改派", exact: true }).click();
        const panel = page.getByLabel("資格異動待處理預約", { exact: true });
        const row = panel.locator(`li[data-allocation-id="${selected.allocationId}"]`);
        const open = row.getByRole("button", { name: "選擇改派人員" });
        await open.click();
        const dialog = page.getByRole("dialog", { name: "改派預約", exact: true });
        await dialog.getByLabel("改派美容師").selectOption(replacement.id);
        await dialog.getByLabel("改派原因").fill("取消不可變更資料");
        await dialog.getByRole("button", { name: "取消", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        expect(await open.evaluate(element => element === document.activeElement)).toBe(true);
        expect(await snapshot()).toEqual(before);
        await open.click();
        expect(await dialog.getByLabel("改派原因").inputValue()).toBe("");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await open.click();
        await dialog.getByLabel("改派美容師").selectOption(replacement.id);
        await dialog.getByLabel("改派原因").fill(command.reason);
        expect(await dialog.getByLabel("保留安排").textContent()).toContain(primary.display_name);
        expect(await dialog.getByLabel("保留安排").textContent()).toContain("Bundle service 2");
        for (const [width, height] of [[320, 640], [390, 844], [390, 420], [768, 900], [1440, 900]]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          await dialog.evaluate(async element => {
            await Promise.all(element.getAnimations().map(animation => animation.finished));
          });
          expect(await page.locator("html").evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
          const bounds = await dialog.getByRole("button", { name: "確認改派", exact: true }).boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.y).toBeGreaterThanOrEqual(0);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
          expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
          await page.screenshot({ path: `.dev-logs/bundle-reassignment-${width}-${height}.png`, fullPage: true });
        }
        await page.setViewportSize({ width: 320, height: 640 });
        await dialog.getByLabel("改派原因").focus();
        await keyboardViewport(page, 320, 48);
        await expectKeyboardControls(dialog);
        await dialog.getByLabel("改派美容師").focus();
        await keyboardViewport(page, 320, 48);
        await expectKeyboardControls(dialog, "改派美容師");
        await keyboardViewport(page, null);
        await page.setViewportSize({ width: 390, height: 844 });
        await dialog.getByLabel("改派原因").focus();
        for (const [height, offsetTop] of [[420, 0], [360, 64], [320, 96]]) {
          await keyboardViewport(page, height, offsetTop);
          await expectKeyboardControls(dialog);
          expect(await dialog.getByLabel("改派原因").inputValue()).toBe(command.reason);
          await page.screenshot({ path: `.dev-logs/reassignment-keyboard-${height}-${offsetTop}.png` });
        }
        await keyboardViewport(page, null);
        await expectKeyboardControls(dialog);
        await dialog.getByRole("button", { name: "取消", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await keyboardViewport(page, 360, 64);
        await open.click();
        await dialog.getByLabel("改派美容師").selectOption(replacement.id);
        await dialog.getByLabel("改派原因").fill(command.reason);
        await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
        await keyboardViewport(page, 360, 64);
        await expectKeyboardControls(dialog);
        const saved = page.waitForResponse(response => response.url().includes("/bookings/reassign") && response.request().method() === "PATCH");
        const leave = await prisma.staff_time_off.create({ data: { organization_id: organizationId,
          location_id: locationId, staff_profile_id: replacement.id, starts_at: segments[0].starts_at,
          ends_at: segments[0].ends_at, reason: "UI failure and retry" } });
        try {
          await dialog.getByRole("button", { name: "確認改派", exact: true }).click();
          expect((await saved).status()).toBe(409);
          await dialog.getByRole("alert").waitFor();
          expect(await dialog.getByRole("alert").textContent()).toBe("此美容師當時未排班或休假，請選擇其他人員");
          expect(await dialog.getByLabel("改派原因").inputValue()).toBe(command.reason);
          expect(await dialog.getByLabel("改派美容師").inputValue()).toBe(replacement.id);
          await dialog.getByLabel("改派原因").focus();
          await keyboardViewport(page, 320, 96);
          await expectKeyboardControls(dialog);
          expect(await snapshot()).toEqual(before);
        } finally { await prisma.staff_time_off.delete({ where: { id: leave.id } }); }
        const retried = page.waitForResponse(response => response.url().includes("/bookings/reassign") && response.request().method() === "PATCH");
        await dialog.getByRole("button", { name: "確認改派", exact: true }).click();
        expect((await retried).status()).toBe(200);
        await dialog.waitFor({ state: "hidden" });
        await keyboardViewport(page, null);
        await row.waitFor({ state: "detached" });
        await panel.locator(`li[data-segment-id="${segments[1].id}"]`).waitFor();
        expect(await panel.locator(`li[data-segment-id="${segments[1].id}"]`).count()).toBe(1);
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    } else { await reassignFutureBooking(command); }
    const after = await snapshot();
    expect(after.booking_segments).toEqual(before.booking_segments);
    expect(after.booking_resource_allocations).toEqual(before.booking_resource_allocations);
    expect(after.booking_staff_allocations.filter(row => row.staff_profile_id !== replacement.id))
      .toEqual(before.booking_staff_allocations.filter(row => row.id !== selected.allocationId));
    const inserted = after.booking_staff_allocations.find(row => row.staff_profile_id === replacement.id)!;
    const removed = before.booking_staff_allocations.find(row => row.id === selected.allocationId)!;
    expect([inserted.starts_at, inserted.ends_at, inserted.booking_segment_id])
      .toEqual([removed.starts_at, removed.ends_at, removed.booking_segment_id]);
    expect([after.total_minor, after.subtotal_minor, after.discount_minor, after.deposit_required_minor, after.policy_snapshot])
      .toEqual([before.total_minor, before.subtotal_minor, before.discount_minor, before.deposit_required_minor, before.policy_snapshot]);
    await expect(reassignFutureBooking(command)).rejects.toMatchObject({ status: 409 });
    const next = (await listQualificationReviews(context)).items.filter(row => row.bookingId === booking.id);
    expect(next).toHaveLength(1);
    await reassignFutureBooking({ ...command, segmentId: next[0].segmentId,
      allocationId: next[0].allocationId!, expectedVersion: next[0].bookingVersion });
    expect((await listQualificationReviews(context)).items.filter(row => row.bookingId === booking.id)).toEqual([]);
    expect(await prisma.notification_outbox.count({ where: { booking_id: booking.id, event_type: "BOOKING_RESCHEDULED" } })).toBe(2);
    const current = await snapshot();
    const originalPrimary = current.booking_staff_allocations.find(row => row.booking_segment_id === segments[0].id && row.staff_profile_id === primary.id)!;
    await expect(reassignFutureBooking({ ...command, allocationId: originalPrimary.id,
      expectedVersion: current.version, targetStaffId: partner.id })).rejects.toMatchObject({ status: 409 });
    const partnerQualification = await prisma.service_staff_assignments.findFirstOrThrow({ where: {
      location_service_id: services[0].id, staff_profile_id: partner.id } });
    await setStaffCapability({ context, assignmentId: partnerQualification.id,
      effectiveFrom: new Date("2020-01-01T00:00:00Z"), effectiveUntil: null,
      onlineSelectable: true, walkInEligible: true, reason: "Restore synthetic partner" });
    await reassignFutureBooking({ ...command, allocationId: originalPrimary.id,
      expectedVersion: current.version, targetStaffId: partner.id });
    const changedPrimary = await snapshot();
    expect(changedPrimary.booking_segments[0].assigned_staff_id).toBe(partner.id);
    expect(changedPrimary.booking_segments[0].staff_name_snapshot).toBe(partner.display_name);
    expect(changedPrimary.booking_segments[1]).toEqual(current.booking_segments[1]);
    expect(changedPrimary.booking_staff_allocations.filter(row => row.staff_profile_id !== partner.id))
      .toEqual(current.booking_staff_allocations.filter(row => row.id !== originalPrimary.id));
    const dispatchEvents = await prisma.$queryRaw<{ count: number }[]>`select count(*)::integer as count
      from public.booking_dispatch_events where booking_id = ${booking.id}::uuid`;
    expect(dispatchEvents[0].count, "unrelated segment rotation must stay untouched").toBe(0);
  } finally {
    await prisma.bookings.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    await prisma.booking_staff_allocations.updateMany({ where: { booking_id: booking.id }, data: { is_blocking: false } });
    await prisma.booking_resource_allocations.updateMany({ where: { booking_id: booking.id }, data: { is_blocking: false } });
    await prisma.resources.update({ where: { id: resource.id }, data: { is_active: false } });
    await prisma.staff_profiles.updateMany({ where: { id: { in: staff.map(row => row.id) } }, data: { is_active: false } });
  }
}, 60000);
