import type { NextRequest } from "next/server";
import {revalidateTag} from "next/cache";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { createMerchantStaff } from "@/server/merchant/management";
import {
  createMerchantStaffSchema,
  merchantScopeSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";
import {catalogDirectorySchema,listMerchantStaff} from "@/server/merchant/catalog-directory";

export async function GET(request: NextRequest) {
  const requestId=getRequestId(request);
  try {
    const session=await requireRequestSession(request);
    const params=request.nextUrl.searchParams;
    const scope=merchantScopeSchema.parse({organization:params.get("organization"),location:params.get("location")});
    const context=await resolveMerchantContext({session,organizationSlug:scope.organization,locationSlug:scope.location});
    const input=catalogDirectorySchema.parse(Object.fromEntries(params));
    return jsonSuccess(await listMerchantStaff(context,input),{headers:{"x-request-id":requestId,"cache-control":"no-store"}});
  } catch(error) {return jsonError(error,requestId,request);}
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
    const input = createMerchantStaffSchema.parse(await request.json());
    const result=await createMerchantStaff({ context, ...input, requestId });
    revalidateTag("public-booking-catalog", {expire: 0});
    return jsonSuccess(
      result,
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
