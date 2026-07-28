import "server-only";

import type { NextRequest } from "next/server";

import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import { hmacToken, sha256 } from "../security/crypto";
import {
  getRequestId,
  getTrustedClientIdentifier,
  hashAbuseIdentifier,
} from "../security/request";

const PUBLIC_SESSION_HEADER = "x-booking-session";

export type PublicLocationContext = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  isTest: boolean;
  locationId: string;
  locationSlug: string;
  locationName: string;
  timezone: string;
  currency: string;
};

export type PublicSessionContext = PublicLocationContext & {
  sessionId: string;
  sessionToken: string;
  requestId: string;
};

export async function resolvePublicLocation(input: {
  organizationSlug: string;
  locationSlug: string;
}): Promise<PublicLocationContext> {
  const location = await prisma.locations.findFirst({
    where: {
      slug: input.locationSlug,
      is_active: true,
      online_booking_enabled: true,
      booking_state: "OPEN",
      organizations: {
        slug: input.organizationSlug,
        public_profile_enabled: true,
        status: {
          in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"],
        },
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      timezone: true,
      currency: true,
      organization_id: true,
      organizations: {
        select: {
          slug: true,
          name: true,
          is_test: true,
        },
      },
    },
  });

  if (!location) {
    throw new AppError("NOT_FOUND", "找不到可預約的店家。", 404);
  }

  return {
    organizationId: location.organization_id,
    organizationSlug: location.organizations.slug,
    organizationName: location.organizations.name,
    isTest: location.organizations.is_test,
    locationId: location.id,
    locationSlug: location.slug,
    locationName: location.name,
    timezone: location.timezone,
    currency: location.currency,
  };
}

export async function requirePublicSession(
  request: NextRequest,
): Promise<PublicSessionContext> {
  const sessionToken = request.headers.get(PUBLIC_SESSION_HEADER)?.trim();
  if (!sessionToken) {
    throw new AppError("UNAUTHENTICATED", "預約工作階段已失效。", 401);
  }

  const session = await prisma.public_booking_sessions.findUnique({
    where: {
      token_hash: sha256(sessionToken),
    },
    select: {
      id: true,
      status: true,
      expires_at: true,
      allowed_origin: true,
      organization_id: true,
      location_id: true,
      locations: {
        select: {
          slug: true,
          name: true,
          timezone: true,
          currency: true,
          is_active: true,
          online_booking_enabled: true,
          booking_state: true,
          organizations: {
            select: {
              slug: true,
              name: true,
              is_test: true,
              public_profile_enabled: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const origin = request.headers.get("origin");
  if (
    !session ||
    session.status !== "ACTIVE" ||
    session.expires_at <= new Date() ||
    !origin ||
    new URL(origin).origin !== session.allowed_origin ||
    !session.locations.is_active ||
    !session.locations.online_booking_enabled ||
    session.locations.booking_state !== "OPEN" ||
    !session.locations.organizations.public_profile_enabled ||
    !["TRIALING", "ACTIVE", "GRACE_PERIOD"].includes(
      session.locations.organizations.status,
    )
  ) {
    throw new AppError("UNAUTHENTICATED", "預約工作階段已失效。", 401);
  }

  return {
    sessionId: session.id,
    sessionToken,
    requestId: getRequestId(request),
    organizationId: session.organization_id,
    organizationSlug: session.locations.organizations.slug,
    organizationName: session.locations.organizations.name,
    isTest: session.locations.organizations.is_test,
    locationId: session.location_id,
    locationSlug: session.locations.slug,
    locationName: session.locations.name,
    timezone: session.locations.timezone,
    currency: session.locations.currency,
  };
}

export function publicRequestIdentifiers(
  request: NextRequest,
  deviceId?: string,
): {
  ipIdentifier: string;
  ipHash: string;
  deviceHash: string | null;
  behaviorHash: string;
} {
  const ipIdentifier = getTrustedClientIdentifier(request);
  const userAgent = request.headers.get("user-agent") ?? "unavailable";

  return {
    ipIdentifier,
    ipHash: hashAbuseIdentifier(`ip:${ipIdentifier}`),
    deviceHash: deviceId
      ? hashAbuseIdentifier(`device:${deviceId}`)
      : null,
    behaviorHash: hashAbuseIdentifier(
      `behavior:${userAgent.slice(0, 256)}`,
    ),
  };
}

export function deriveHoldToken(input: {
  publicSessionToken: string;
  idempotencyKey: string;
}): string {
  return hmacToken(
    getServerEnv().TOKEN_DERIVATION_SECRET,
    `booking-hold:${input.publicSessionToken}:${input.idempotencyKey}`,
  );
}

export function deriveTrackingToken(holdToken: string): string {
  return hmacToken(
    getServerEnv().TOKEN_DERIVATION_SECRET,
    `booking-tracking:${holdToken}`,
  );
}
