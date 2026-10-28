import { NextRequest } from "next/server";
import { z } from "zod";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { adminMerchantApplicationReviewSchema } from "@/server/onboarding/schemas";
import { reviewMerchantApplication } from "@/server/onboarding/service";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getRequestId } from "@/server/security/request";

const pathSchema = z
  .object({
    applicationId: z.uuid(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      applicationId: string;
    }>;
  },
) {
  const requestId = getRequestId(request);

  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    const { applicationId } = pathSchema.parse(await context.params);
    await consumeRateLimit({
      scope: "admin-merchant-application-review",
      identifier: session.profileId,
      limit: 60,
      windowMs: 60 * 60_000,
    });

    const payload = adminMerchantApplicationReviewSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await reviewMerchantApplication({
        session,
        applicationId,
        payload,
        requestId,
      }),
      {
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
