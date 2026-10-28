import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

import type { VerifiedMobileActor } from "../src/server/auth/line-mobile-session";
import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "dispatches unspecified staff through the shared bed exclusion and records only confirmed events",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { resolvePublicLocation }, { getPublicAvailability },
      { bookMobile }, { randomToken, sha256 },
      { addLocalDays, formatDateInTimeZone }, { updateMerchantBookingStatus },
      { configureWalkInPolicy, validateWalkInStart },
      { reassignFutureBooking }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/public-booking/context"),
      import("../src/server/public-booking/availability"),
      import("../src/server/mobile/booking"),
      import("../src/server/security/crypto"),
      import("../src/server/time/timezone"),
      import("../src/server/merchant/bookings"),
      import("../src/server/booking/walkin-policy"),
      import("../src/server/booking/reassignment"),
    ]);
    const org = await prisma.organizations.findUniqueOrThrow({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      select: { slug: true, locations: { where: {
        id: "22222222-2222-4222-8222-222222222221" }, select: { slug: true } } },
    });
    const store = await resolvePublicLocation({ organizationSlug: org.slug,
      locationSlug: org.locations[0].slug });
    const variantId = "66666666-6666-4666-8666-666666666611";
    const today = formatDateInTimeZone(new Date(), store.timezone);
    let startsAt: string | undefined;
    for (let offset = 1; offset <= 14 && !startsAt; offset++) {
      const date = addLocalDays(today, offset);
      const result = await getPublicAvailability({ ...store,
        sessionId: "00000000-0000-4000-8000-000000000000", sessionToken: "query",
        requestId: "query" }, { serviceVariantId: variantId, date });
      startsAt = result.slots[0]?.startsAt;
    }
    expect(startsAt).toBeTruthy();
    const actor: VerifiedMobileActor = { kind: "employee", sessionId: randomToken(16),
      organizationId: store.organizationId, locationId: store.locationId,
      profileId: "33333333-3333-4333-8333-333333333304", customerId: null,
      capabilities: new Set(["booking.create"]) };
    const makeContext = async () => {
      const token = randomToken(32);
      const session = await prisma.public_booking_sessions.create({ data: {
        organization_id: store.organizationId, location_id: store.locationId,
        token_hash: sha256(token), expires_at: new Date(Date.now() + 30 * 60_000),
        ip_hash: sha256("synthetic-ip"), device_hash: sha256(randomToken(16)),
        behavior_hash: sha256("dispatch"), allowed_origin: "http://localhost:45143",
      }, select: { id: true } });
      return { ...store, sessionId: session.id, sessionToken: token,
        requestId: randomToken(12) };
    };
    const [contextA, contextB] = await Promise.all([makeContext(), makeContext()]);
    const create = (context: Awaited<ReturnType<typeof makeContext>>) => bookMobile({
      actor, context, serviceVariantId: variantId, startsAt: startsAt!,
      name: `Walk-in ${randomToken(5)}`,
      phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      source: "phone", dispatchMode: "future", idempotencyKey: randomToken(24),
    });
    const results = await Promise.allSettled([create(contextA), create(contextB)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const winner = results.find(result => result.status === "fulfilled");
    if (!winner || winner.status !== "fulfilled") throw new Error("No dispatch won");
    const events = await prisma.$queryRaw<{ event_type: string }[]>`
      select event_type from public.booking_dispatch_events
      where booking_id = ${winner.value.id}::uuid
    `;
    expect(events.map(event => event.event_type)).toEqual(["FUTURE_RESERVED"]);
    const claims = await prisma.$queryRaw<{ status: string }[]>`
      select status from public.booking_dispatch_claims
      where organization_id = ${store.organizationId}::uuid
        and location_id = ${store.locationId}::uuid
        and starts_at = ${new Date(startsAt!)}
      order by created_at desc limit 2
    `;
    expect(claims.map(claim => claim.status).sort()).toEqual(["CONFIRMED", "FAILED"]);
    let immediateStart: string | undefined;
    let overrideCandidates: string[] = [];
    for (let offset = 1; offset <= 14 && !immediateStart; offset++) {
      const result = await getPublicAvailability({ ...store,
        sessionId: "00000000-0000-4000-8000-000000000000", sessionToken: "query",
        requestId: "query" }, { serviceVariantId: variantId,
        date: addLocalDays(today, offset) });
      const slot = result.slots.find(slot => slot.startsAt !== startsAt &&
        slot.availableStaff.length >= 2);
      immediateStart = slot?.startsAt;
      overrideCandidates = slot?.availableStaff ?? [];
    }
    expect(immediateStart).toBeTruthy();
    const location = await prisma.locations.findUniqueOrThrow({
      where: { id: store.locationId }, select: { slug: true, name: true, timezone: true } });
    const organization = await prisma.organizations.findUniqueOrThrow({
      where: { id: store.organizationId }, select: { slug: true, name: true, status: true } });
    const manager: OrganizationContext = { session: { id: randomToken(16),
      profileId: "33333333-3333-4333-8333-333333333301", email: "owner@example.test",
      displayName: "Owner", platformRole: null, expiresAt: new Date(Date.now()+60_000),
      csrfTokenHash: "" }, organization: { id: store.organizationId, ...organization },
      location: { id: store.locationId, ...location },
      roles: new Set(["ORGANIZATION_OWNER"]), allLocations: true,
      accessibleLocationIds: new Set([store.locationId]), linkedStaffProfileId: null };
    await prisma.$executeRaw`delete from public.store_walkin_policies where organization_id=${store.organizationId}::uuid and location_id=${store.locationId}::uuid`;
    await expect(bookMobile({ actor, context: await makeContext(),
      serviceVariantId: variantId, startsAt: immediateStart!,
      name: "Unconfigured walk-in", phone: "0912345678", source: "phone",
      dispatchMode: "immediate", idempotencyKey: randomToken(24) }))
      .rejects.toMatchObject({ status: 503 });
    const policy = await configureWalkInPolicy({ context: manager,
      earliestStartMinutes: 15, setupBufferMinutes: 10,
      onlineMinimumAdvanceApplies: false, requestId: randomToken(12) });
    expect(policy.version).toBe(1);
    expect(() => validateWalkInStart(new Date(Date.now()+24*60_000),
      new Date(),policy,60)).toThrow();
    expect(() => validateWalkInStart(new Date(Date.now()+26*60_000),
      new Date(),policy,60)).not.toThrow();
    expect(() => validateWalkInStart(new Date(Date.now()+26*60_000),
      new Date(),{ ...policy, onlineMinimumAdvanceApplies: true },60)).toThrow();
    await expect(configureWalkInPolicy({ context: manager,
      earliestStartMinutes: 15, setupBufferMinutes: 10,
      onlineMinimumAdvanceApplies: true, expectedVersion: 0,
      requestId: randomToken(12) })).rejects.toMatchObject({ status: 409 });
    const immediate = await bookMobile({ actor, context: await makeContext(),
      serviceVariantId: variantId, startsAt: immediateStart!,
      name: `Walk-in ${randomToken(5)}`,
      phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      source: "phone", dispatchMode: "immediate", idempotencyKey: randomToken(24) });
    const immediateClaim = await prisma.$queryRaw<{ staff_profile_id: string }[]>`
      select staff_profile_id from public.booking_dispatch_claims
      where booking_id = ${immediate.id}::uuid
    `;
    const target = overrideCandidates.find(staff =>
      staff !== immediateClaim[0].staff_profile_id);
    expect(target).toBeTruthy();
    await expect(reassignFutureBooking({ context: manager, bookingId: immediate.id,
      targetStaffId: target!, reason: " ", requestId: randomToken(12) }))
      .rejects.toMatchObject({ status: 400 });
    await expect(reassignFutureBooking({ context: { ...manager,
      roles: new Set(["FRONT_DESK"] ) }, bookingId: immediate.id,
      targetStaffId: target!, reason: "Unauthorized override",
      requestId: randomToken(12) })).rejects.toMatchObject({ status: 403 });
    await reassignFutureBooking({ context: manager, bookingId: immediate.id,
      targetStaffId: target!, reason: "Owner override for synthetic staffing",
      requestId: randomToken(12) });
    const replay = await prisma.$queryRaw<{ staff_profile_id: string; score: bigint }[]>`
      select staff_profile_id, sum(case
        when event_type in ('IMMEDIATE_ASSIGNED', 'REASSIGNED') then 1
        when event_type = 'PRESTART_COMPENSATED' then -1 else 0 end) as score
      from public.booking_dispatch_events where booking_id = ${immediate.id}::uuid
      group by staff_profile_id order by staff_profile_id
    `;
    expect(replay.find(row => row.staff_profile_id === target)?.score).toBe(1n);
    expect(replay.find(row => row.staff_profile_id === immediateClaim[0].staff_profile_id)?.score).toBe(0n);
    const override = await prisma.$queryRaw<{ reason: string }[]>`
      select reason from public.booking_dispatch_events
      where booking_id = ${immediate.id}::uuid and event_type = 'OVERRIDE'
    `;
    expect(override.map(row => row.reason)).toEqual(["Owner override for synthetic staffing"]);
    const before = await prisma.bookings.findUniqueOrThrow({ where: { id: immediate.id },
      select: { version: true } });
    await updateMerchantBookingStatus({ context: manager, bookingId: immediate.id,
      nextStatus: "CANCELLED", expectedVersion: before.version,
      reason: "synthetic cancellation", requestId: randomToken(12) });
    const rotation = await prisma.$queryRaw<{ event_type: string }[]>`
      select event_type from public.booking_dispatch_events
      where booking_id = ${immediate.id}::uuid order by occurred_at
    `;
    expect(rotation.map(event => event.event_type).sort()).toEqual([
      "IMMEDIATE_ASSIGNED", "OVERRIDE", "PRESTART_COMPENSATED", "REASSIGNED",
    ].sort());
    await prisma.$executeRaw`delete from public.store_walkin_policies where organization_id=${store.organizationId}::uuid and location_id=${store.locationId}::uuid`;
  }, 60_000,
);
