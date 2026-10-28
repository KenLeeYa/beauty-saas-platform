import type {NextRequest} from "next/server";
import {revalidateTag} from "next/cache";
import {assertSessionCsrf,requireRequestSession} from "@/server/auth/session";
import {resolveMerchantContext} from "@/server/merchant/context";
import {createStaffSkillSchema,merchantScopeSchema,updateStaffSkillsSchema} from "@/server/merchant/schemas";
import {createStaffSkill,updateStaffSkills,listStaffSkills,skillCatalogQuerySchema} from "@/server/merchant/staff-skills";
import {jsonError,jsonSuccess} from "@/server/http/response";
import {getRequestId} from "@/server/security/request";

async function contextFor(request:NextRequest) {
  const session=await requireRequestSession(request);
  if(request.method!=="GET") assertSessionCsrf(request,session);
  const scope=merchantScopeSchema.parse({organization:request.nextUrl.searchParams.get("organization"),location:request.nextUrl.searchParams.get("location")});
  return resolveMerchantContext({session,organizationSlug:scope.organization,locationSlug:scope.location});
}
export async function GET(request:NextRequest) {
  const requestId=getRequestId(request);
  try {
    const context=await contextFor(request);
    const query=skillCatalogQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return jsonSuccess(await listStaffSkills(context,query),{headers:{"cache-control":"no-store","x-request-id":requestId}});
  } catch(error){return jsonError(error,requestId,request);}
}
export async function POST(request:NextRequest) {
  const requestId=getRequestId(request);
  try {const context=await contextFor(request);
    return jsonSuccess(await createStaffSkill({context,...createStaffSkillSchema.parse(await request.json()),requestId}),{status:201});
  } catch(error){return jsonError(error,requestId,request);}
}
export async function PATCH(request:NextRequest) {
  const requestId=getRequestId(request);
  try {const context=await contextFor(request);
    const result=await updateStaffSkills({context,...updateStaffSkillsSchema.parse(await request.json()),requestId});
    revalidateTag("public-booking-catalog",{expire:0});
    return jsonSuccess(result);
  } catch(error){return jsonError(error,requestId,request);}
}
