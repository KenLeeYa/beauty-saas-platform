import type { NextRequest } from "next/server";

import { prisma } from "@/server/database/prisma";
import { AppError } from "@/server/http/errors";
import { jsonError, jsonSuccess } from "@/server/http/response";
import {
  publicRequestIdentifiers,
  resolvePublicLocation,
} from "@/server/public-booking/context";
import { createPublicSessionSchema } from "@/server/public-booking/schemas";
import { randomToken, sha256 } from "@/server/security/crypto";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  assertSameOrigin,
  getRequestId,
} from "@/server/security/request";
import { verifyTurnstile } from "@/server/security/turnstile";

const SESSION_TTL_MS = 30 * 60 * 1_000;

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    assertSameOrigin(request);

    const input = createPublicSessionSchema.parse(await request.json());
    const location = await resolvePublicLocation(input);
    const identifiers = publicRequestIdentifiers(request, input.deviceId);

    await Promise.all([
      consumeRateLimit({
        scope: `public-session:ip:${location.locationId}`,
        identifier: identifiers.ipIdentifier,
        limit: 20,
        windowMs: 10 * 60 * 1_000,
      }),
      consumeRateLimit({
        scope: `public-session:device:${location.locationId}`,
        identifier: input.deviceId,
        limit: 12,
        windowMs: 10 * 60 * 1_000,
      }),
    ]);

    await verifyTurnstile({
      token: input.turnstileToken,
      expectedAction: "booking_session",
      remoteIp: identifiers.ipIdentifier,
    });

    const origin = request.headers.get("origin");
    if (!origin) {
      throw new AppError("INVALID_ORIGIN", "缺少請求來源。", 403);
    }

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await prisma.public_booking_sessions.create({
      data: {
        organization_id: location.organizationId,
        location_id: location.locationId,
        token_hash: sha256(token),
        expires_at: expiresAt,
        ip_hash: identifiers.ipHash,
        device_hash: identifiers.deviceHash,
        behavior_hash: identifiers.behaviorHash,
        allowed_origin: new URL(origin).origin,
      },
      select: {
        id: true,
      },
    });

    await prisma.public_booking_attempts.create({
      data: {
        organization_id: location.organizationId,
        location_id: location.locationId,
        public_booking_session_id: session.id,
        request_id: requestId,
        event_type: "CREATE_SESSION",
        outcome: "ALLOWED",
        reason_code: "TURNSTILE_VERIFIED",
        ip_hash: identifiers.ipHash,
        device_hash: identifiers.deviceHash,
        behavior_hash: identifiers.behaviorHash,
        session_token_hash: sha256(token),
      },
    });

    return jsonSuccess(
      {
        token,
        expiresAt: expiresAt.toISOString(),
        organization: {
          slug: location.organizationSlug,
          name: location.organizationName,
        },
        location: {
          slug: location.locationSlug,
          name: location.locationName,
          timezone: location.timezone,
          currency: location.currency,
        },
      },
      {
        status: 201,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
