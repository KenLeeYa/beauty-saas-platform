import type { NextRequest } from "next/server";

import { AppError } from "@/server/http/errors";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { confirmPublicBooking } from "@/server/public-booking/booking";
import { requirePublicSession } from "@/server/public-booking/context";
import {
  confirmPublicBookingSchema,
  idempotencyKeySchema,
} from "@/server/public-booking/schemas";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { assertSameOrigin, getRequestId } from "@/server/security/request";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    assertSameOrigin(request);
    const context = await requirePublicSession(request);
    const payload = confirmPublicBookingSchema.parse(await request.json());
    const rawIdempotencyKey = request.headers.get("idempotency-key");
    if (!rawIdempotencyKey) {
      throw new AppError("BAD_REQUEST", "缺少冪等識別碼。", 400);
    }
    const idempotencyKey =
      idempotencyKeySchema.parse(rawIdempotencyKey);

    await consumeRateLimit({
      scope: `public-confirm:${context.locationId}`,
      identifier: context.sessionId,
      limit: 8,
      windowMs: 10 * 60 * 1_000,
    });

    return jsonSuccess(
      await confirmPublicBooking({
        context,
        payload,
        idempotencyKey,
      }),
      {
        status: 201,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
