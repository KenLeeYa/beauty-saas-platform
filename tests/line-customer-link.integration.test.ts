import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "links an existing customer only with their scoped booking possession token",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { ensureCustomerLineLink, createLineMobileSession,
      linkExistingCustomerByBooking }, { resolveLineActor }, { randomToken, sha256 }] =
      await Promise.all([
        import("../src/server/database/prisma"),
        import("../src/server/auth/line-linking"),
        import("../src/server/auth/line-mobile-session-store"),
        import("../src/server/security/crypto"),
      ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const channelId = "synthetic-login-channel";
    await prisma.$executeRaw(Prisma.sql`
      insert into public.store_line_channels
        (organization_id, location_id, provider_id, channel_id, purpose, is_enabled)
      values (${organizationId}::uuid, ${locationId}::uuid,
        'synthetic-provider', ${channelId}, 'LOGIN', true)
      on conflict (organization_id, location_id, channel_id)
      do update set purpose = 'LOGIN', is_enabled = true
    `);
    const identity = { providerId: "synthetic-provider", channelId,
      subject: `U-link-${randomToken(12)}` };
    const placeholderId = await ensureCustomerLineLink({ organizationId, locationId,
      channelId, identity });
    const session = await createLineMobileSession({ organizationId, locationId,
      channelId, identity, deviceId: randomToken(16), origin: "http://localhost:45143" });
    const actor = await resolveLineActor(session.token, organizationId, locationId);
    expect(actor?.customerId).toBe(placeholderId);
    const target = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Existing synthetic customer",
    }, select: { id: true } });
    const proof = randomToken(32);
    const booking = await prisma.bookings.create({ data: {
      organization_id: organizationId, location_id: locationId,
      customer_id: target.id, status: "CONFIRMED", subtotal_minor: 1000,
      total_minor: 1000, tracking_token_hash: sha256(proof), is_test: true,
    }, select: { id: true } });
    const command = { organizationId, locationId, mobileSessionId: actor!.sessionId,
      currentCustomerId: placeholderId, trackingToken: proof };
    await expect(linkExistingCustomerByBooking({ ...command,
      trackingToken: randomToken(32) })).rejects.toMatchObject({ status: 404 });
    expect(await linkExistingCustomerByBooking(command)).toBe(target.id);
    expect((await resolveLineActor(session.token, organizationId, locationId))?.customerId)
      .toBe(target.id);
    expect(await linkExistingCustomerByBooking({ ...command,
      currentCustomerId: target.id })).toBe(target.id);
    expect((await prisma.bookings.findUniqueOrThrow({ where: { id: booking.id } })).customer_id)
      .toBe(target.id);
  }, 60_000,
);
