import { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getRequestId } from "@/server/security/request";
import { merchantSetupActionSchema } from "@/server/setup/schemas";
import { runMerchantSetupAction } from "@/server/setup/service";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    await consumeRateLimit({
      scope: "merchant-setup-action",
      identifier: session.profileId,
      limit: 60,
      windowMs: 60 * 60_000,
    });
    const scope = merchantScopeSchema.parse({
      organization: request.nextUrl.searchParams.get("organization"),
      location: request.nextUrl.searchParams.get("location"),
    });
    const context = await resolveMerchantContext({
      session,
      organizationSlug: scope.organization,
      locationSlug: scope.location,
    });
    const payload = merchantSetupActionSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await runMerchantSetupAction({
        context,
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
