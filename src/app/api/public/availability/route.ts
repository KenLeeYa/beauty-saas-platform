import type { NextRequest } from "next/server";

import { jsonError, jsonSuccess } from "@/server/http/response";
import { getPublicAvailability } from "@/server/public-booking/availability";
import { requirePublicSession } from "@/server/public-booking/context";
import { publicAvailabilitySchema } from "@/server/public-booking/schemas";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { assertSameOrigin, getRequestId } from "@/server/security/request";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    assertSameOrigin(request);
    const context = await requirePublicSession(request);
    const input = publicAvailabilitySchema.parse(await request.json());

    await consumeRateLimit({
      scope: `public-availability:${context.locationId}`,
      identifier: context.sessionId,
      limit: 120,
      windowMs: 10 * 60 * 1_000,
    });

    return jsonSuccess(await getPublicAvailability(context, input), {
      headers: {
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
