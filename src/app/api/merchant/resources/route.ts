import type { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { createMerchantResource } from "@/server/merchant/management";
import {
  createMerchantResourceSchema,
  merchantScopeSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";
import {listMerchantResources, resourceDirectorySchema} from "@/server/merchant/facility-directory";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    const scope = merchantScopeSchema.parse({organization: request.nextUrl.searchParams.get("organization"), location: request.nextUrl.searchParams.get("location")});
    const context = await resolveMerchantContext({session, organizationSlug: scope.organization, locationSlug: scope.location});
    const input = resourceDirectorySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return jsonSuccess(await listMerchantResources(context, input), {headers: {"x-request-id": requestId, "cache-control": "no-store"}});
  } catch (error) {return jsonError(error, requestId, request);}
}

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
    const input = createMerchantResourceSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await createMerchantResource({ context, ...input, requestId }),
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
