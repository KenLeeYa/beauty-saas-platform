import type { NextRequest } from "next/server";

import { retryMerchantNotification } from "@/modules/notifications/server/merchant-notification-service";
import { retryNotificationSchema } from "@/modules/notifications/server/schemas";
import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    const scope = merchantScopeSchema.parse({
      organization: request.nextUrl.searchParams.get("organization"),
      location: request.nextUrl.searchParams.get("location"),
    });
    const context = await resolveMerchantContext({
      session,
      organizationSlug: scope.organization,
      locationSlug: scope.location,
    });
    const input = retryNotificationSchema.parse(await request.json());
    return jsonSuccess(
      await retryMerchantNotification({ context, ...input, requestId }),
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
