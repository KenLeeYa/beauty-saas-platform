import type {NextRequest} from "next/server";
import {requireRequestSession} from "@/server/auth/session";
import {resolveMerchantContext} from "@/server/merchant/context";
import {merchantScopeSchema} from "@/server/merchant/schemas";
import {bookingDirectorySchema,listMerchantBookings} from "@/server/merchant/booking-directory";
import {jsonError,jsonSuccess} from "@/server/http/response";
import {getRequestId} from "@/server/security/request";

export async function GET(request:NextRequest) {
  const requestId=getRequestId(request);
  try {
    const session=await requireRequestSession(request);
    const params=request.nextUrl.searchParams;
    const scope=merchantScopeSchema.parse({organization:params.get("organization"),location:params.get("location")});
    const context=await resolveMerchantContext({session,organizationSlug:scope.organization,locationSlug:scope.location});
    const input=bookingDirectorySchema.parse(Object.fromEntries(params));
    return jsonSuccess(await listMerchantBookings(context,input),{headers:{"x-request-id":requestId,"cache-control":"no-store"}});
  } catch(error) {return jsonError(error,requestId,request);}
}
