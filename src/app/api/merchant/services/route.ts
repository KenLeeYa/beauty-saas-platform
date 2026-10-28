import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {updateServiceSkills} from "@/server/merchant/staff-skills";
import {listMerchantServices,serviceDirectorySchema} from "@/server/merchant/catalog-directory";

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

async function requestContext(request: NextRequest, write = true) {
  const session = await requireRequestSession(request);
  if (write) assertSessionCsrf(request, session);
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

export async function GET(request: NextRequest) {
  const requestId=getRequestId(request);
  try {
    const context=await requestContext(request,false);
    const input=serviceDirectorySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return jsonSuccess(await listMerchantServices(context,input),{headers:{"x-request-id":requestId,"cache-control":"no-store"}});
  } catch(error) {return jsonError(error,requestId,request);}
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
    return jsonError(error, requestId, request);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const context = await requestContext(request);
    const input = merchantServiceUpdateSchema.parse(
      await request.json(),
    );
    const result = "action" in input && input.action === "UPDATE_SKILLS"
      ? await updateServiceSkills({context,...input,requestId})
      : "action" in input
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
    return jsonError(error, requestId, request);
  }
}
