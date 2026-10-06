import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { approveEmployeeLineLink, revokeEmployeeLineLink } from "@/server/auth/line-linking";
import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { assertCapability, requireLocation } from "@/server/authorization/context";
import { prisma } from "@/server/database/prisma";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const actionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("approve"),requestId:z.uuid()}).strict(),
  z.object({action:z.literal("revoke"),linkId:z.uuid(),reason:z.string().trim().min(1).max(500)}).strict(),
]);

async function contextFor(request:NextRequest) {
  const session=await requireRequestSession(request);
  const scope=merchantScopeSchema.parse({organization:request.nextUrl.searchParams.get("organization"),
    location:request.nextUrl.searchParams.get("location")});
  return resolveMerchantContext({session,organizationSlug:scope.organization,locationSlug:scope.location});
}

export async function GET(request:NextRequest) {
  const requestId=getRequestId(request);
  try {
    const context=await contextFor(request);
    assertCapability(context,"team.manage");
    const location=requireLocation(context);
    const rows=await prisma.$queryRaw<{id:string;profileId:string;displayName:string;verifiedAt:Date;expiresAt:Date}[]>(Prisma.sql`
      select request.id,request.profile_id as "profileId",
        profile.display_name as "displayName",request.verified_at as "verifiedAt",
        request.expires_at as "expiresAt"
      from public.line_employee_link_requests request
      join public.profiles profile on profile.id=request.profile_id
      where request.organization_id=${context.organization.id}::uuid
        and request.location_id=${location.id}::uuid
        and request.status='PENDING' and request.expires_at>now()
      order by request.verified_at desc limit 50
    `);
    return jsonSuccess(rows,{headers:{"cache-control":"no-store","x-request-id":requestId}});
  } catch(error) {return jsonError(error,requestId);}
}

export async function POST(request:NextRequest) {
  const requestId=getRequestId(request);
  try {
    const session=await requireRequestSession(request);
    assertSessionCsrf(request,session);
    const context=await contextFor(request);
    const action=actionSchema.parse(await request.json());
    if(action.action==="approve") return jsonSuccess(await approveEmployeeLineLink({
      context,requestId:action.requestId}),{headers:{"x-request-id":requestId}});
    await revokeEmployeeLineLink({context,linkId:action.linkId,reason:action.reason});
    return jsonSuccess({revoked:true},{headers:{"x-request-id":requestId}});
  } catch(error) {return jsonError(error,requestId);}
}
