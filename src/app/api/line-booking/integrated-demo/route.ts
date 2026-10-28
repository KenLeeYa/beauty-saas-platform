import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createApplicationSession } from "@/server/auth/session";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { createLineMobileSession, ensureCustomerLineLink,
  lineSubjectHash } from "@/server/auth/line-linking";
import { prisma } from "@/server/database/prisma";
import { randomToken } from "@/server/security/crypto";
import { localTrialOrigin } from "@/server/mobile/local-trial-policy";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222221";
const channelId = "synthetic-login-channel";
const providerId = "synthetic-provider";
const entrySlug = "synthetic-beauty-line";
const roles = {
  customer: null,
  receptionist: "33333333-3333-4333-8333-333333333304",
  beautician: "33333333-3333-4333-8333-333333333305",
  owner: "33333333-3333-4333-8333-333333333301",
} as const;
const demo = {organizationId,locationId,channelId,providerId,entrySlug,roles};

export async function GET(request: NextRequest): Promise<Response> {
  const host = request.headers.get("host");
  const publicUrl = new URL(request.url);
  if (host) publicUrl.host = host;
  const trialOrigin = localTrialOrigin(publicUrl.toString(), host, process.env);
  if (!trialOrigin) return new Response("Not found",{ status: 404 });
  const store = request.nextUrl.searchParams.get("store") ?? "demo";
  if (!["demo","showcase"].includes(store)) return new Response("Unknown local store",{status:400});
  const {organizationId,locationId,channelId,providerId,entrySlug,roles} = store === "showcase" ? {
    organizationId:"d1000000-0000-4000-8000-000000000001",locationId:"d2000000-0000-4000-8000-000000000001",
    channelId:"showcase-local-login",providerId:"showcase-local-provider",entrySlug:"showcase-daan",
    roles:{customer:null,owner:"d3000000-0000-4000-8000-000000000001",receptionist:"d3000000-0000-4000-8000-000000000004",beautician:"d3000000-0000-4000-8000-000000000005"},
  } : demo;
  const role = z.enum(["customer","receptionist","beautician","owner"])
    .safeParse(request.nextUrl.searchParams.get("role"));
  if (!role.success) return new Response("Invalid synthetic role",{ status: 400 });
  const profileId = roles[role.data];
  const identity = { providerId, subject: `synthetic-integrated:${role.data}` };
  const organization = await prisma.organizations.findUnique({ where: {
    id: organizationId }, select: { slug: true } });
  const location = await prisma.locations.findUnique({ where: {
    id: locationId }, select: { slug: true } });
  if (!organization || !location) return new Response("Synthetic store missing",{ status: 503 });
  await prisma.$executeRaw(Prisma.sql`
    insert into public.mobile_store_entries
      (organization_id,location_id,entry_slug,is_enabled)
    values (${organizationId}::uuid,${locationId}::uuid,${entrySlug},true)
    on conflict (organization_id,location_id)
    do update set entry_slug=excluded.entry_slug,is_enabled=true
  `);
  await prisma.$executeRaw(Prisma.sql`
    insert into public.store_line_channels
      (organization_id,location_id,provider_id,channel_id,purpose,is_enabled)
    values (${organizationId}::uuid,${locationId}::uuid,${providerId},
      ${channelId},'LOGIN',true)
    on conflict (organization_id,location_id,channel_id)
    do update set is_enabled=true,purpose='LOGIN'
  `);
  if (profileId) {
    const membership = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.location_memberships where
        organization_id=${organizationId}::uuid and location_id=${locationId}::uuid
        and profile_id=${profileId}::uuid and status='ACTIVE'
      union select id from public.organization_memberships where
        organization_id=${organizationId}::uuid and profile_id=${profileId}::uuid
        and status='ACTIVE' and all_locations=true limit 1
    `);
    if (!membership[0]) return new Response("Synthetic role missing",{ status: 503 });
    await prisma.$executeRaw(Prisma.sql`
      insert into public.line_identity_links
        (organization_id,provider_id,subject_hash,actor_kind,profile_id,
         approved_by_profile_id,approved_at)
      values (${organizationId}::uuid,${providerId},${lineSubjectHash(identity)},
        'EMPLOYEE',${profileId}::uuid,
        ${roles.owner}::uuid,now())
      on conflict (organization_id,provider_id,subject_hash,actor_kind)
        where revoked_at is null do nothing
    `);
  } else {
    await ensureCustomerLineLink({ organizationId,locationId,channelId,identity });
  }
  const session = await createLineMobileSession({ organizationId,locationId,
    channelId,identity,deviceId:randomToken(16),origin:trialOrigin });
  const destination = store === "showcase" && role.data === "customer" ? `/book/showcase/daan` : profileId === roles.owner ?
    `/merchant/operations?organization=${encodeURIComponent(organization.slug)}&location=${encodeURIComponent(location.slug)}` :
    `/line-booking/${entrySlug}`;
  const response = NextResponse.redirect(new URL(destination,trialOrigin));
  response.cookies.set("beauty_line_session",session.token,{ httpOnly:true,
    sameSite:"lax",secure:false,path:"/",maxAge:1800 });
  if (profileId) {
    const desktop = await createApplicationSession({ profileId });
    response.cookies.set(SESSION_COOKIE_NAME,desktop.sessionToken,{ httpOnly:true,
      sameSite:"lax",secure:false,path:"/",maxAge:8*3600 });
    response.cookies.set(CSRF_COOKIE_NAME,desktop.csrfToken,{ httpOnly:false,
      sameSite:"lax",secure:false,path:"/",maxAge:8*3600 });
  } else {
    response.cookies.set(SESSION_COOKIE_NAME,"",{ httpOnly:true,sameSite:"lax",path:"/",maxAge:0 });
    response.cookies.set(CSRF_COOKIE_NAME,"",{ sameSite:"lax",path:"/",maxAge:0 });
  }
  return response;
}
