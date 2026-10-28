import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { updateMerchantBookingSettings } from "@/server/merchant/management";
import {
  merchantBookingSettingsSchema,
  merchantScopeSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

export async function PATCH(request: NextRequest) {
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
    const input = merchantBookingSettingsSchema.parse(
      await request.json(),
    );
    const result = await updateMerchantBookingSettings({
      context,
      ...input,
      requestId,
    });
    revalidateTag("public-booking-catalog", { expire: 0 });
    return jsonSuccess(
      result,
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
