import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it, vi } from "vitest";
import type { OrganizationContext } from "../src/server/authorization/context";
import {randomUUID} from 'node:crypto';

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "requires manager approval for two separately proved employee LINE accounts",
  async () => {
    loadEnvConfig(process.cwd());
    const [{prisma},{verifyLineIdentity},{recordVerifiedEmployeeLinkRequest,
      approveEmployeeLineLink,createLineMobileSession,revokeEmployeeLineLink},
      {resolveLineActor},{randomToken}] = await Promise.all([
      import("../src/server/database/prisma"),import("../src/server/auth/line-identity"),
      import("../src/server/auth/line-linking"),
      import("../src/server/auth/line-mobile-session-store"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId="11111111-1111-4111-8111-111111111111";
    const locationId="22222222-2222-4222-8222-222222222221";
    const ownerId="33333333-3333-4333-8333-333333333301";
    const employeeId="33333333-3333-4333-8333-333333333304";
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
    const organization=await prisma.organizations.findUniqueOrThrow({where:{id:organizationId},select:{slug:true,name:true,status:true}});
    const location=await prisma.locations.findUniqueOrThrow({where:{id:locationId},select:{slug:true,name:true,timezone:true}});
    const context:OrganizationContext={
      session:{id:randomToken(16),profileId:ownerId,email:"synthetic@example.test",
        displayName:"Synthetic owner",platformRole:null,expiresAt:new Date(Date.now()+60_000),csrfTokenHash:""},
      organization:{id:organizationId,slug:organization.slug,name:organization.name,status:organization.status},
      location:{id:locationId,slug:location.slug,name:location.name,timezone:location.timezone},
      roles:new Set(["ORGANIZATION_OWNER"]),allLocations:true,
      accessibleLocationIds:new Set([locationId]),linkedStaffProfileId:null,
    };
    const verify=async () => {
      const nonce=randomToken(16);
      const subject=`U-synthetic-${randomToken(8)}`;
      const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({
        iss:"https://access.line.me",aud:channelId,sub:subject,nonce,
        exp:Math.floor(Date.now()/1000)+600}),{status:200}));
      return verifyLineIdentity("synthetic-id-token",{channelId,providerId:"synthetic-provider"},nonce,fetcher);
    };
    const first=await verify(), second=await verify();
    expect(first.subject).not.toBe(second.subject);
    await expect(recordVerifiedEmployeeLinkRequest({organizationId,locationId,
      channelId,profileId:employeeId,identity:{...first,providerId:"other-provider"}}))
      .rejects.toMatchObject({status:403});
    const firstRequest=await recordVerifiedEmployeeLinkRequest({organizationId,locationId,
      channelId,profileId:employeeId,identity:first});
    const secondRequest=await recordVerifiedEmployeeLinkRequest({organizationId,locationId,
      channelId,profileId:employeeId,identity:second});
    await expect(createLineMobileSession({organizationId,locationId,channelId,
      identity:first,deviceId:randomToken(16),origin:"http://127.0.0.1:45143"}))
      .rejects.toMatchObject({status:403});
    const firstLink=await approveEmployeeLineLink({context,requestId:firstRequest});
    const secondLink=await approveEmployeeLineLink({context,requestId:secondRequest});
    expect(firstLink.profileId).toBe(employeeId);
    expect(secondLink.profileId).toBe(employeeId);
    const firstSession=await createLineMobileSession({organizationId,locationId,channelId,
      identity:first,deviceId:randomToken(16),origin:"http://127.0.0.1:45143"});
    const secondSession=await createLineMobileSession({organizationId,locationId,channelId,
      identity:second,deviceId:randomToken(16),origin:"http://127.0.0.1:45143"});
    expect((await resolveLineActor(firstSession.token,organizationId,locationId))?.capabilities.has("booking.create")).toBe(true);
    expect((await resolveLineActor(secondSession.token,organizationId,locationId))?.capabilities.has("booking.create")).toBe(true);
    await revokeEmployeeLineLink({context,linkId:firstLink.linkId,reason:"synthetic unlink"});
    expect(await resolveLineActor(firstSession.token,organizationId,locationId)).toBeNull();
    expect((await resolveLineActor(secondSession.token,organizationId,locationId))?.kind).toBe("employee");

    const [{GET:getAvailability},{POST:createBooking},{PATCH:changeBooking},
      {addLocalDays,formatDateInTimeZone}]=await Promise.all([
      import('../src/app/api/line-booking/availability/route'),
      import('../src/app/api/line-booking/booking/route'),
      import('../src/app/api/line-booking/booking/[id]/route'),
      import('../src/server/time/timezone'),
    ]);
    const origin='http://127.0.0.1:45143';
    const requestHeaders={cookie:`beauty_line_session=${secondSession.token}`,
      host:'127.0.0.1:45143',origin};
    const variantId='66666666-6666-4666-8666-666666666611';
    const staffId='44444444-4444-4444-8444-444444444401';
    const today=formatDateInTimeZone(new Date(),location.timezone);
    let slot:string|undefined;
    for(let offset=1;offset<=14&&!slot;offset++) {
      const query=new URLSearchParams({store:entrySlug,service:variantId,staff:staffId,
        date:addLocalDays(today,offset)});
      const response=await getAvailability(new Request(`${origin}/api/line-booking/availability?${query}`,
        {headers:requestHeaders}));
      expect(response.status).toBe(200);
      slot=(await response.json() as {slots:string[]}).slots[0];
    }
    expect(slot).toBeTruthy();
    const phone=`09${Math.floor(10000000+Math.random()*90000000)}`;
    const response=await createBooking(new Request(`${origin}/api/line-booking/booking`,{
      method:'POST',headers:{...requestHeaders,'content-type':'application/json'},
      body:JSON.stringify({store:entrySlug,serviceId:variantId,staffId,start:slot,
        name:'Synthetic manual phone',phone,source:'phone',idempotencyKey:randomUUID()}),
    }));
    expect(response.status).toBe(201);
    const created=await response.json() as {id:string};
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:created.id}})).source).toBe('PHONE');
    const cancelled=await changeBooking(new Request(`${origin}/api/line-booking/booking/${created.id}`,{
      method:'PATCH',headers:{...requestHeaders,'content-type':'application/json'},
      body:JSON.stringify({store:entrySlug,action:'cancel'}),
    }),{params:Promise.resolve({id:created.id})});
    expect(cancelled.status).toBe(200);
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:created.id}})).status).toBe('CANCELLED');
  },60_000,
);
