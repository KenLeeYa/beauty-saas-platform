import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import {
  createMerchantService,
  setMerchantServiceOnline,
  updateMerchantServiceBuffers,
} from "@/server/merchant/management";
import {
  createMerchantServiceSchema,
  merchantScopeSchema,
  merchantServiceUpdateSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

async function requestContext(request: NextRequest) {
  const session = await requireRequestSession(request);
  assertSessionCsrf(request, session);
  const scope = merchantScopeSchema.parse({
    organization: request.nextUrl.searchParams.get("organization"),
    location: request.nextUrl.searchParams.get("location"),
  });
  return resolveMerchantContext({
    session,
    organizationSlug: scope.organization,
    locationSlug: scope.location,
  });
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const context = await requestContext(request);
    const input = createMerchantServiceSchema.parse(
      await request.json(),
    );
    const result = await createMerchantService({
      context,
      ...input,
      requestId,
    });
    revalidateTag("public-booking-catalog", { expire: 0 });
    return jsonSuccess(
      result,
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const context = await requestContext(request);
    const input = merchantServiceUpdateSchema.parse(
      await request.json(),
    );
    const result = "action" in input
      ? await updateMerchantServiceBuffers({
          context,
          ...input,
          requestId,
        })
      : await setMerchantServiceOnline({
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
    return jsonError(error, requestId);
  }
}
