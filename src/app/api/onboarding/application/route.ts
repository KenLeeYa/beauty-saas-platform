import { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { merchantApplicationFormSchema } from "@/server/onboarding/schemas";
import { saveMerchantApplication } from "@/server/onboarding/service";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getRequestId,
  getTrustedClientIdentifier,
} from "@/server/security/request";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    await consumeRateLimit({
      scope: "merchant-application-write",
      identifier: `${session.profileId}:${getTrustedClientIdentifier(
        request,
      )}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });

    const payload = merchantApplicationFormSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await saveMerchantApplication({
        session,
        payload,
        requestId,
      }),
      {
        status: payload.submit ? 201 : 200,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
