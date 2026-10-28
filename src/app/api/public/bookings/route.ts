import type { NextRequest } from "next/server";

import { jsonError, jsonSuccess } from "@/server/http/response";
import { getPublicBooking } from "@/server/public-booking/booking";
import { trackingTokenSchema } from "@/server/public-booking/schemas";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getRequestId } from "@/server/security/request";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const { trackingToken } = trackingTokenSchema.parse({
      trackingToken: request.nextUrl.searchParams.get("trackingToken"),
    });
    await consumeRateLimit({
      scope: "public-booking-read",
      identifier: trackingToken,
      limit: 30,
      windowMs: 10 * 60 * 1_000,
    });
    return jsonSuccess(await getPublicBooking(trackingToken), {
      headers: {
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
