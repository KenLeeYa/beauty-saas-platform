import type { NextRequest } from "next/server";

import { jsonError, jsonSuccess } from "@/server/http/response";
import { cancelPublicBooking } from "@/server/public-booking/booking";
import { cancelPublicBookingSchema } from "@/server/public-booking/schemas";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { assertSameOrigin, getRequestId } from "@/server/security/request";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    assertSameOrigin(request);
    const input = cancelPublicBookingSchema.parse(await request.json());
    await consumeRateLimit({
      scope: "public-booking-cancel",
      identifier: input.trackingToken,
      limit: 6,
      windowMs: 30 * 60 * 1_000,
    });
    return jsonSuccess(
      await cancelPublicBooking({
        ...input,
        requestId,
      }),
      {
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
