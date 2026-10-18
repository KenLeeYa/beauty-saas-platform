import "server-only";

import { Prisma } from "@prisma/client";

import { resolveLineActor } from "../auth/line-mobile-session-store";
import type { VerifiedMobileActor } from "../auth/line-mobile-session";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import type { PublicSessionContext } from "../public-booking/context";
import { sha256 } from "../security/crypto";
import { getRequestId } from "../security/request";
import { resolveMobileStore } from "./store";

type BridgedSession = {
  id: string;
  status: string;
  expiresAt: Date;
  allowedOrigin: string;
};

export function mobileSessionToken(request: Request): string | null {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("beauty_line_session="))
    ?.slice("beauty_line_session=".length);
  return value || null;
}

export async function requireMobileBookingContext(
  request: Request,
  entrySlug: string,
): Promise<{ actor: VerifiedMobileActor; context: PublicSessionContext }> {
  const store = await resolveMobileStore(entrySlug);
  const token = mobileSessionToken(request);
  if (!token) throw new AppError("UNAUTHENTICATED", "LINE sign-in required", 401);
  const actor = await resolveLineActor(token, store.organizationId, store.locationId);
  if (!actor) throw new AppError("UNAUTHENTICATED", "LINE session expired", 401);
  const rows = await prisma.$queryRaw<BridgedSession[]>(Prisma.sql`
    select booking_session.id, booking_session.status,
      booking_session.expires_at as "expiresAt",
      booking_session.allowed_origin as "allowedOrigin"
    from public.line_mobile_sessions mobile
    join public.public_booking_sessions booking_session
      on booking_session.id = mobile.public_booking_session_id
      and booking_session.organization_id = mobile.organization_id
      and booking_session.location_id = mobile.location_id
    where mobile.id = ${actor.sessionId}::uuid
      and mobile.token_hash = ${sha256(token)}
    limit 1
  `);
  const session = rows[0];
  const host = request.headers.get("host");
  let requestOrigin: string;
  try {
    requestOrigin = host ? new URL(`${new URL(request.url).protocol}//${host}`).origin :
      new URL(request.url).origin;
  } catch { throw new AppError("UNAUTHENTICATED","Invalid request host",401); }
  if (!session || session.status !== "ACTIVE" || session.expiresAt <= new Date() ||
      session.allowedOrigin !== requestOrigin) {
    throw new AppError("UNAUTHENTICATED", "Booking session expired", 401);
  }
  return { actor, context: { ...store, sessionId: session.id, sessionToken: token,
    requestId: getRequestId(request) } };
}
