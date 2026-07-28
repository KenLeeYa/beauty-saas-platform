import type { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import {
  createMerchantService,
  setMerchantServiceOnline,
} from "@/server/merchant/management";
import {
  createMerchantServiceSchema,
  merchantScopeSchema,
  merchantServiceToggleSchema,
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
    return jsonSuccess(
      await createMerchantService({ context, ...input, requestId }),
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
    const input = merchantServiceToggleSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await setMerchantServiceOnline({
        context,
        ...input,
        requestId,
      }),
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
