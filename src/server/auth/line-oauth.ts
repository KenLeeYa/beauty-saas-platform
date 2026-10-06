import "server-only";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { recordAudit } from "../audit";
import { AppError } from "../http/errors";
import { getStoreLineLoginChannel, resolveStoreLineChannel } from "../notifications/line-channel-registry";
import { constantTimeEqual, hmacToken, randomToken, sha256 } from "../security/crypto";
import { verifyLineIdentity } from "./line-identity";
import { createLineMobileSession, ensureCustomerLineLink, recordVerifiedEmployeeLinkRequest,
  resolveApprovedEmployeeLineProfile } from "./line-linking";
import { resolveSessionDestination } from "./destination";
import { createApplicationSession, setSessionCookies } from "./session";
import { getRequestId, getTrustedClientIdentifier, hashAbuseIdentifier } from "../security/request";
import { resolveMobileStore } from "../mobile/store";
import { resolveSessionToken } from "./session";
import { SESSION_COOKIE_NAME } from "./constants";

const tokenResponseSchema = z.object({ id_token: z.string().min(1) });
const channelSecretsSchema = z.record(z.string(), z.string());

type OAuthStateRow = {
  organizationId: string;
  locationId: string;
  channelId: string;
  nonceHash: string;
  intent: "CUSTOMER_LOGIN" | "EMPLOYEE_LINK" | "EMPLOYEE_LOGIN";
  requestedProfileId: string | null;
};

function oauthCookie(value: string, maxAge: number, secure: boolean): string {
  return `beauty_line_oauth_state=${value}; Path=/api/line-booking/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return `beauty_line_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function canonicalLineOrigin(request: Request): URL {
  const configured = new URL(getServerEnv().NEXT_PUBLIC_APP_URL);
  const host = request.headers.get("host")?.toLowerCase();
  if (!host || host !== configured.host.toLowerCase() ||
      (getServerEnv().APP_ENV === "production" && configured.protocol !== "https:")) {
    throw new AppError("BAD_REQUEST", "Use the configured booking domain", 400);
  }
  return configured;
}

export async function startMobileLineLogin(request: Request, entrySlug: string,
  employeeProfileId?: string, desktopLogin = false): Promise<Response> {
  if (employeeProfileId && desktopLogin) throw new AppError("BAD_REQUEST", "Invalid LINE intent", 400);
  const origin = canonicalLineOrigin(request);
  const store = await resolveMobileStore(entrySlug);
  const channel = await getStoreLineLoginChannel(store.organizationId, store.locationId);
  if (!channel) throw new AppError("FEATURE_UNAVAILABLE", "LINE Login is not configured", 503);
  const state = randomToken(32);
  const nonce = hmacToken(getServerEnv().TOKEN_DERIVATION_SECRET, `line-oauth:${state}`);
  await prisma.$executeRaw(Prisma.sql`
    insert into public.line_oauth_states
      (organization_id, location_id, channel_id, state_hash, nonce_hash,
        intent, requested_profile_id, expires_at)
    values (${store.organizationId}::uuid, ${store.locationId}::uuid,
      ${channel.channelId}, ${sha256(state)}, ${sha256(nonce)},
        ${employeeProfileId ? "EMPLOYEE_LINK" : desktopLogin ? "EMPLOYEE_LOGIN" : "CUSTOMER_LOGIN"},
      ${employeeProfileId ?? null}::uuid,
      now() + interval '10 minutes')
  `);
  const authorize = new URL("https://access.line.me/oauth2/v2.1/authorize");
  const redirectUri = new URL("/api/line-booking/callback", origin).toString();
  authorize.search = new URLSearchParams({ response_type: "code",
    client_id: channel.channelId, redirect_uri: redirectUri, state,
    scope: "openid profile", nonce }).toString();
  return new Response(null, { status: 302, headers: {
    location: authorize.toString(),
    "set-cookie": oauthCookie(state, 600, origin.protocol === "https:"),
  } });
}

export async function finishMobileLineLogin(request: Request): Promise<Response> {
  const origin = canonicalLineOrigin(request);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const cookieState = request.headers.get("cookie")?.split(";").map(part => part.trim())
    .find(part => part.startsWith("beauty_line_oauth_state="))
    ?.slice("beauty_line_oauth_state=".length);
  if (!state || !code || !cookieState || !constantTimeEqual(state, cookieState)) {
    throw new AppError("UNAUTHENTICATED", "Invalid LINE OAuth state", 401);
  }
  const states = await prisma.$queryRaw<OAuthStateRow[]>(Prisma.sql`
    update public.line_oauth_states set consumed_at = now()
    where state_hash = ${sha256(state)} and consumed_at is null
      and expires_at > now()
    returning organization_id as "organizationId", location_id as "locationId",
      channel_id as "channelId", nonce_hash as "nonceHash",
      intent, requested_profile_id as "requestedProfileId"
  `);
  const oauth = states[0];
  if (!oauth) throw new AppError("UNAUTHENTICATED", "LINE OAuth state expired", 401);
  const channel = await resolveStoreLineChannel(oauth.organizationId, oauth.locationId, oauth.channelId);
  if (!channel) throw new AppError("FEATURE_UNAVAILABLE", "LINE channel is disabled", 503);
  const nonce = hmacToken(getServerEnv().TOKEN_DERIVATION_SECRET, `line-oauth:${state}`);
  if (sha256(nonce) !== oauth.nonceHash) throw new AppError("UNAUTHENTICATED", "Invalid LINE nonce", 401);
  const secrets = channelSecretsSchema.parse(JSON.parse(process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON || "{}") as unknown);
  const secret = secrets[channel.channelId];
  if (!secret) throw new AppError("FEATURE_UNAVAILABLE", "LINE channel secret is not configured", 503);
  const token = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code,
      redirect_uri: new URL("/api/line-booking/callback", origin).toString(),
      client_id: channel.channelId, client_secret: secret }), cache: "no-store",
  });
  if (!token.ok) throw new AppError("UNAUTHENTICATED", "LINE token exchange failed", 401);
  const parsed = tokenResponseSchema.parse(await token.json());
  const identity = await verifyLineIdentity(parsed.id_token, channel, nonce);
  if (oauth.intent === "EMPLOYEE_LOGIN") {
    const employee = await resolveApprovedEmployeeLineProfile({
      organizationId: oauth.organizationId, locationId: oauth.locationId,
      channelId: oauth.channelId, identity,
    });
    const identifier = getTrustedClientIdentifier(request);
    const material = await createApplicationSession({ profileId: employee.profileId,
      userAgent: request.headers.get("user-agent"), ipIdentifier: identifier,
      lineLink: { id: employee.linkId, organizationId: oauth.organizationId,
        locationId: oauth.locationId } });
    const mobile = await createLineMobileSession({
      organizationId: oauth.organizationId, locationId: oauth.locationId,
      channelId: oauth.channelId, identity, deviceId: randomToken(16),
      origin: origin.origin,
    });
    const destination = await resolveSessionDestination({
      profileId: employee.profileId, platformRole: null,
    });
    const response = NextResponse.redirect(new URL(destination, origin));
    setSessionCookies(response, material);
    response.headers.append("set-cookie", sessionCookie(mobile.token, 30 * 60,
      origin.protocol === "https:"));
    response.headers.append("set-cookie", oauthCookie("", 0,
      origin.protocol === "https:"));
    await recordAudit({ actorProfileId: employee.profileId,
      action: "LINE_BACKOFFICE_LOGIN_SUCCESS", targetType: "AUTH",
      outcome: "SUCCESS", requestId: getRequestId(request),
      ipHash: hashAbuseIdentifier(identifier) });
    return response;
  }
  if (oauth.intent === "EMPLOYEE_LINK") {
    const desktopToken=request.headers.get("cookie")?.split(";").map(part=>part.trim())
      .find(part=>part.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.slice(SESSION_COOKIE_NAME.length+1);
    const desktop=await resolveSessionToken(desktopToken);
    if (!desktop || desktop.profileId!==oauth.requestedProfileId) {
      throw new AppError("UNAUTHENTICATED", "Desktop employee session required", 401);
    }
    await recordVerifiedEmployeeLinkRequest({organizationId:oauth.organizationId,
      locationId:oauth.locationId,channelId:oauth.channelId,
      profileId:desktop.profileId,identity});
    const headers=new Headers({location:"/merchant/staff?lineLink=pending"});
    headers.append("set-cookie",oauthCookie("",0,origin.protocol==="https:"));
    return new Response(null,{status:302,headers});
  }
  await ensureCustomerLineLink({ organizationId: oauth.organizationId,
    locationId: oauth.locationId, channelId: channel.channelId, identity });
  const session = await createLineMobileSession({ organizationId: oauth.organizationId,
    locationId: oauth.locationId, channelId: channel.channelId, identity,
    deviceId: randomToken(16), origin: origin.origin });
  const entries = await prisma.$queryRaw<{ entrySlug: string }[]>(Prisma.sql`
    select entry_slug as "entrySlug" from public.mobile_store_entries
    where organization_id = ${oauth.organizationId}::uuid
      and location_id = ${oauth.locationId}::uuid and is_enabled limit 1
  `);
  if (!entries[0]) throw new AppError("NOT_FOUND", "Store not found", 404);
  const headers = new Headers({ location: `/line-booking/${encodeURIComponent(entries[0].entrySlug)}` });
  const secure = origin.protocol === "https:";
  headers.append("set-cookie", sessionCookie(session.token, 30 * 60, secure));
  headers.append("set-cookie", oauthCookie("", 0, secure));
  return new Response(null, { status: 302, headers });
}
