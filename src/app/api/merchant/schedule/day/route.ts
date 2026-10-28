import type { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { setMerchantDaySchedule } from "@/server/merchant/management";
import {
  merchantDayScheduleSchema,
  merchantScopeSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

export async function PUT(request: NextRequest) {
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
    const input = merchantDayScheduleSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await setMerchantDaySchedule({
        context,
        ...input,
        requestId,
      }),
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
