import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "consumes OAuth state once and revokes one device without revoking a second",
  async () => {
    loadEnvConfig(process.cwd());
    const previousOrigin=process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL="http://127.0.0.1:45143";
    const [{prisma},{startMobileLineLogin,finishMobileLineLogin},
      {resolveLineActor},{revokeLineMobileSession}] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/auth/line-oauth"),
      import("../src/server/auth/line-mobile-session-store"),
      import("../src/server/auth/line-linking"),
    ]);
    const organizationId="11111111-1111-4111-8111-111111111111";
    const locationId="22222222-2222-4222-8222-222222222221";
    const channelId="synthetic-login-channel";
    const entrySlug="synthetic-beauty-line";
    await prisma.$executeRaw(Prisma.sql`
      insert into public.mobile_store_entries (organization_id,location_id,entry_slug,is_enabled)
      values (${organizationId}::uuid,${locationId}::uuid,${entrySlug},true)
      on conflict (organization_id,location_id) do update set entry_slug=excluded.entry_slug,is_enabled=true
    `);
    await prisma.$executeRaw(Prisma.sql`
      insert into public.store_line_channels
        (organization_id,location_id,provider_id,channel_id,purpose,is_enabled)
      values (${organizationId}::uuid,${locationId}::uuid,
        'synthetic-provider',${channelId},'LOGIN',true)
      on conflict (organization_id,location_id,channel_id)
      do update set purpose='LOGIN',is_enabled=true
    `);
    const previousSecrets=process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON;
    process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON=JSON.stringify({[channelId]:"synthetic-only-placeholder"});
    let nonce="";
    const fetcher=vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/token")) return new Response(JSON.stringify({id_token:"synthetic-id-token"}),{status:200});
      return new Response(JSON.stringify({iss:"https://access.line.me",aud:channelId,
        sub:"U-synthetic-two-devices",nonce,exp:Math.floor(Date.now()/1000)+600}),{status:200});
    });
    vi.stubGlobal("fetch",fetcher);
    try {
      const signIn=async () => {
        const start=await startMobileLineLogin(new Request(`http://127.0.0.1:45143/api/line-booking/login?store=${entrySlug}`,
          {headers:{host:"127.0.0.1:45143"}}),entrySlug);
        expect(start.status).toBe(302);
        const authorize=new URL(start.headers.get("location")!);
        const state=authorize.searchParams.get("state")!;
        nonce=authorize.searchParams.get("nonce")!;
        const callback=new Request(`http://127.0.0.1:45143/api/line-booking/callback?state=${state}&code=synthetic-code`,
          {headers:{host:"127.0.0.1:45143",cookie:`beauty_line_oauth_state=${state}`}});
        const result=await finishMobileLineLogin(callback);
        expect(result.status).toBe(302);
        const cookie=result.headers.getSetCookie().find(value=>value.startsWith("beauty_line_session="))!;
        return {token:cookie.split(";")[0].slice("beauty_line_session=".length),callback};
      };
      const first=await signIn();
      await expect(startMobileLineLogin(new Request(`http://wrong-host.test/api/line-booking/login?store=${entrySlug}`,
        {headers:{host:"wrong-host.test"}}),entrySlug)).rejects.toMatchObject({status:400});
      await expect(finishMobileLineLogin(first.callback)).rejects.toMatchObject({status:401});
      const second=await signIn();
      expect(first.token).not.toBe(second.token);
      expect((await resolveLineActor(first.token,organizationId,locationId))?.kind).toBe("customer");
      expect((await resolveLineActor(second.token,organizationId,locationId))?.kind).toBe("customer");
      await revokeLineMobileSession({token:first.token,organizationId,locationId});
      expect(await resolveLineActor(first.token,organizationId,locationId)).toBeNull();
      expect((await resolveLineActor(second.token,organizationId,locationId))?.kind).toBe("customer");
    } finally {
      vi.unstubAllGlobals();
      if (previousSecrets===undefined) delete process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON;
      else process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON=previousSecrets;
      if (previousOrigin===undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL=previousOrigin;
    }
  },60_000,
);
