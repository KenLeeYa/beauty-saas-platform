import { NextRequest, NextResponse } from "next/server";

import { recordAudit } from "@/server/audit";
import { resolveSessionDestination } from "@/server/auth/destination";
import { authenticateLocalUser } from "@/server/auth/local-auth";
import {
  createApplicationSession,
  setSessionCookies,
} from "@/server/auth/session";
import { authenticateSupabasePasswordUser } from "@/server/auth/supabase";
import { getServerEnv } from "@/server/env";
import { jsonError } from "@/server/http/response";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  assertSameOrigin,
  getRequestId,
  getTrustedClientIdentifier,
  hashAbuseIdentifier,
} from "@/server/security/request";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const clientIdentifier = getTrustedClientIdentifier(request);

  try {
    assertSameOrigin(request);
    const body: unknown = await request.json();
    const candidateEmail =
      typeof body === "object" &&
      body !== null &&
      "email" in body &&
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "invalid";

    await Promise.all([
      consumeRateLimit({
        scope: "login-client",
        identifier: clientIdentifier,
        limit: 20,
        windowMs: 15 * 60_000,
      }),
      consumeRateLimit({
        scope: "login-client-account",
        identifier: `${clientIdentifier}:${candidateEmail}`,
        limit: 5,
        windowMs: 15 * 60_000,
      }),
    ]);

    const env = getServerEnv();
    const localAuth =
      env.APP_ENV !== "production" && env.ENABLE_LOCAL_AUTH_STUB;
    const profile = localAuth
      ? await authenticateLocalUser(body)
      : await authenticateSupabasePasswordUser(body);
    const material = await createApplicationSession({
      profileId: profile.profileId,
      userAgent: request.headers.get("user-agent"),
      ipIdentifier: clientIdentifier,
    });
    const destination = await resolveSessionDestination({
      profileId: profile.profileId,
      platformRole: profile.platformRole,
    });

    const response = NextResponse.json(
      {
        data: {
          redirectTo: destination,
        },
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
    setSessionCookies(response, material);

    await recordAudit({
      actorProfileId: profile.profileId,
      action: localAuth
        ? "LOCAL_LOGIN_SUCCESS"
        : "PASSWORD_LOGIN_SUCCESS",
      targetType: "AUTH",
      outcome: "SUCCESS",
      requestId,
      ipHash: hashAbuseIdentifier(clientIdentifier),
    });

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
