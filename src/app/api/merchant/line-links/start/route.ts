import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { resolveOrganizationContext } from "@/server/authorization/context";
import { startMobileLineLogin } from "@/server/auth/line-oauth";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMobileStore } from "@/server/mobile/store";
import { getRequestId } from "@/server/security/request";

const schema=z.object({store:z.string().min(1).max(80)}).strict();

export async function POST(request:NextRequest) {
  const requestId=getRequestId(request);
  try {
    const session=await requireRequestSession(request);
    assertSessionCsrf(request,session);
    const {store}=schema.parse(await request.json());
    const location=await resolveMobileStore(store);
    const context=await resolveOrganizationContext({session,
      organizationSlug:location.organizationSlug,locationSlug:location.locationSlug});
    if(context.organization.id!==location.organizationId || context.location?.id!==location.locationId) {
      throw new Error("Store access mismatch");
    }
    const redirect=await startMobileLineLogin(request,store,session.profileId);
    return jsonSuccess({authorizeUrl:redirect.headers.get("location")},{
      headers:{"set-cookie":redirect.headers.get("set-cookie")??"","x-request-id":requestId}});
  } catch(error) {return jsonError(error,requestId);}
}
