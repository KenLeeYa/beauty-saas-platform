import "server-only";

import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import {
  constantTimeEqual,
  hmacSha256,
  randomToken,
  sha256,
} from "../security/crypto";
import { assertSameOrigin } from "../security/request";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./constants";

export type ApplicationSession = {
  id: string;
  profileId: string;
  email: string;
  displayName: string;
  platformRole: string | null;
  expiresAt: Date;
  csrfTokenHash: string;
};

export type SessionMaterial = {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
};

function csrfHash(sessionId: string, csrfToken: string): string {
  return hmacSha256(
    getServerEnv().CSRF_SECRET,
    `${sessionId}:${csrfToken}`,
  );
}

function secureCookies(): boolean {
  return getServerEnv().APP_ENV === "production";
}

export async function createApplicationSession(input: {
  profileId: string;
  userAgent?: string | null;
  ipIdentifier?: string | null;
  lineLink?: { id: string; organizationId: string; locationId: string };
}): Promise<SessionMaterial> {
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.$transaction(async (transaction) => {
    const session = await transaction.auth_sessions.create({
    data: {
      profile_id: input.profileId,
      token_hash: sha256(sessionToken),
      csrf_token_hash: "pending",
      expires_at: expiresAt,
      user_agent_hash: input.userAgent ? sha256(input.userAgent) : null,
      ip_hash: input.ipIdentifier ? sha256(input.ipIdentifier) : null,
    },
    select: {
      id: true,
    },
  });
    if (input.lineLink) {
      const inserted = await transaction.$executeRaw(Prisma.sql`
        insert into public.line_desktop_sessions
          (auth_session_id, identity_link_id, organization_id, location_id)
        select ${session.id}::uuid, link.id, link.organization_id,
          ${input.lineLink.locationId}::uuid
        from public.line_identity_links link
        where link.id=${input.lineLink.id}::uuid
          and link.organization_id=${input.lineLink.organizationId}::uuid
          and link.profile_id=${input.profileId}::uuid
          and link.actor_kind='EMPLOYEE' and link.approved_at is not null
          and link.revoked_at is null
      `);
      if (inserted !== 1) throw new AppError("FORBIDDEN", "LINE link expired", 403);
    }
    await transaction.auth_sessions.update({
    where: {
      id: session.id,
    },
    data: {
      csrf_token_hash: csrfHash(session.id, csrfToken),
    },
    });
    return session;
  });

  return {
    sessionToken,
    csrfToken,
    expiresAt,
  };
}

export function setSessionCookies(
  response: NextResponse,
  material: SessionMaterial,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, material.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: material.expiresAt,
  });
  response.cookies.set(CSRF_COOKIE_NAME, material.csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: material.expiresAt,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: 0,
  });
}

export async function resolveSessionToken(
  token: string | undefined,
): Promise<ApplicationSession | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.auth_sessions.findUnique({
    where: {
      token_hash: sha256(token),
    },
    select: {
      id: true,
      profile_id: true,
      csrf_token_hash: true,
      expires_at: true,
      revoked_at: true,
      last_seen_at: true,
      profiles: {
        select: {
          email: true,
          display_name: true,
          platform_role: true,
          is_active: true,
        },
      },
    },
  });

  if (
    !session ||
    session.revoked_at ||
    session.expires_at <= new Date() ||
    !session.profiles.is_active
  ) {
    return null;
  }

  const lineSessions = await prisma.$queryRaw<{ active: boolean }[]>(Prisma.sql`
    select link.revoked_at is null and link.approved_at is not null as active
    from public.line_desktop_sessions desktop
    join public.line_identity_links link on link.id=desktop.identity_link_id
    where desktop.auth_session_id=${session.id}::uuid
  `);
  if (lineSessions[0] && !lineSessions[0].active) return null;

  if (Date.now() - session.last_seen_at.getTime() > 5 * 60 * 1000) {
    await prisma.auth_sessions.update({
      where: { id: session.id },
      data: { last_seen_at: new Date() },
    });
  }

  return {
    id: session.id,
    profileId: session.profile_id,
    email: session.profiles.email,
    displayName: session.profiles.display_name,
    platformRole: session.profiles.platform_role,
    expiresAt: session.expires_at,
    csrfTokenHash: session.csrf_token_hash,
  };
}

export async function getCurrentSession(): Promise<ApplicationSession | null> {
  const cookieStore = await cookies();
  return resolveSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function requireCurrentSession(): Promise<ApplicationSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new AppError("UNAUTHENTICATED", "請先登入。", 401);
  }
  return session;
}

export async function requireRequestSession(
  request: NextRequest,
): Promise<ApplicationSession> {
  const session = await resolveSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    throw new AppError("UNAUTHENTICATED", "請先登入。", 401);
  }
  return session;
}

export function assertSessionCsrf(
  request: NextRequest,
  session: ApplicationSession,
): void {
  assertSameOrigin(request);

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (
    !cookieToken ||
    !headerToken ||
    !constantTimeEqual(cookieToken, headerToken)
  ) {
    throw new AppError("INVALID_CSRF", "安全驗證失敗，請重新整理。", 403);
  }

  const expectedHash = csrfHash(session.id, cookieToken);
  if (!constantTimeEqual(expectedHash, session.csrfTokenHash)) {
    throw new AppError("INVALID_CSRF", "安全驗證已失效，請重新登入。", 403);
  }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.auth_sessions.updateMany({
    where: {
      id: sessionId,
      revoked_at: null,
    },
    data: {
      revoked_at: new Date(),
    },
  });
}
