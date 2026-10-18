import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";

import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "logs approved owner, receptionist and beautician into their existing profiles",
  async () => {
    loadEnvConfig(process.cwd());
    const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
    const previousSecrets = process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON;
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:45143";
    const channelId = "synthetic-login-channel";
    process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON = JSON.stringify({
      [channelId]: "synthetic-only-placeholder",
    });
    const [{ prisma }, { randomToken }, { recordVerifiedEmployeeLinkRequest,
      approveEmployeeLineLink, resolveApprovedEmployeeLineProfile,
      revokeEmployeeLineLink }, { startMobileLineLogin, finishMobileLineLogin },
      { resolveSessionToken }, { resolveSessionDestination }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/security/crypto"),
      import("../src/server/auth/line-linking"),
      import("../src/server/auth/line-oauth"),
      import("../src/server/auth/session"),
      import("../src/server/auth/destination"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const store = "synthetic-beauty-line";
    const origin = "http://127.0.0.1:45143";
    await prisma.$executeRaw(Prisma.sql`
      insert into public.mobile_store_entries (organization_id, location_id, entry_slug, is_enabled)
      values (${organizationId}::uuid, ${locationId}::uuid, ${store}, true)
      on conflict (organization_id, location_id)
      do update set entry_slug=excluded.entry_slug, is_enabled=true
    `);
    await prisma.$executeRaw(Prisma.sql`
      insert into public.store_line_channels
        (organization_id, location_id, provider_id, channel_id, purpose, is_enabled)
      values (${organizationId}::uuid, ${locationId}::uuid,
        'synthetic-provider', ${channelId}, 'LOGIN', true)
      on conflict (organization_id, location_id, channel_id)
      do update set is_enabled=true, purpose='LOGIN'
    `);
    const organization = await prisma.organizations.findUniqueOrThrow({
      where: { id: organizationId }, select: { slug: true, name: true, status: true },
    });
    const location = await prisma.locations.findUniqueOrThrow({
      where: { id: locationId }, select: { slug: true, name: true, timezone: true },
    });
    const manager: OrganizationContext = {
      session: { id: randomToken(16), profileId: "33333333-3333-4333-8333-333333333301",
        email: "owner@example.test", displayName: "Owner", platformRole: null,
        expiresAt: new Date(Date.now() + 60_000), csrfTokenHash: "" },
      organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location },
      roles: new Set(["ORGANIZATION_OWNER"]), allLocations: true,
      accessibleLocationIds: new Set([locationId]), linkedStaffProfileId: null,
    };
    const roles = [
      ["owner", "33333333-3333-4333-8333-333333333301"],
      ["receptionist", "33333333-3333-4333-8333-333333333304"],
      ["beautician", "33333333-3333-4333-8333-333333333305"],
    ] as const;
    try {
      for (const [role, profileId] of roles) {
        const identity = { providerId: "synthetic-provider",
          subject: `U-desktop-${role}-${randomToken(6)}` };
        await expect(resolveApprovedEmployeeLineProfile({ organizationId, locationId,
          channelId, identity })).rejects.toMatchObject({ status: 403 });
        const requestId = await recordVerifiedEmployeeLinkRequest({
          organizationId, locationId, channelId, profileId, identity,
        });
        const approved = await approveEmployeeLineLink({ context: manager, requestId });
        const started = await startMobileLineLogin(new Request(
          `${origin}/api/auth/line/login?store=${store}`,
          { headers: { host: "127.0.0.1:45143" } }), store, undefined, true);
        const authorize = new URL(started.headers.get("location")!);
        const state = authorize.searchParams.get("state")!;
        const nonce = authorize.searchParams.get("nonce")!;
        vi.stubGlobal("fetch", vi.fn(async (url: string | URL) =>
          String(url).endsWith("/token")
            ? new Response(JSON.stringify({ id_token: "synthetic-id-token" }), { status: 200 })
            : new Response(JSON.stringify({ iss: "https://access.line.me",
              aud: channelId, sub: identity.subject, nonce,
              exp: Math.floor(Date.now() / 1000) + 600 }), { status: 200 })));
        const callback = await finishMobileLineLogin(new Request(
          `${origin}/api/line-booking/callback?state=${state}&code=synthetic-code`,
          { headers: { host: "127.0.0.1:45143",
            cookie: `beauty_line_oauth_state=${state}` } }));
        expect(callback.status).toBe(307);
        expect(callback.headers.get("location")).toBe(new URL(
          await resolveSessionDestination({ profileId, platformRole: null }), origin).toString());
        const cookie = callback.headers.getSetCookie().find(value =>
          value.startsWith("beauty_session="));
        expect(cookie).toBeTruthy();
        const token = cookie!.split(";")[0].slice("beauty_session=".length);
        expect((await resolveSessionToken(token))?.profileId).toBe(profileId);
        expect(callback.headers.getSetCookie().some(value =>
          value.startsWith("beauty_line_session="))).toBe(true);
        await revokeEmployeeLineLink({ context: manager, linkId: approved.linkId,
          reason: "synthetic unlink" });
        expect(await resolveSessionToken(token)).toBeNull();
      }
    } finally {
      vi.unstubAllGlobals();
      if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
      if (previousSecrets === undefined) delete process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON;
      else process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON = previousSecrets;
    }
  }, 90_000,
);
