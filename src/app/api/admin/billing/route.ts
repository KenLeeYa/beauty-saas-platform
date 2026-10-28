import { NextRequest } from "next/server";

import { runAdminBillingAction } from "@/server/admin/billing";
import { adminBillingActionSchema } from "@/server/admin/billing-schemas";
import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getRequestId } from "@/server/security/request";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    await consumeRateLimit({
      scope: "admin-billing-action",
      identifier: session.profileId,
      limit: 120,
      windowMs: 60 * 60_000,
    });
    const payload = adminBillingActionSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await runAdminBillingAction({
        session,
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
