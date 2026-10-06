import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireRequestSession } from "@/server/auth/session";
import { jsonError,jsonSuccess } from "@/server/http/response";
import { getMarketingConsentReview } from "@/server/merchant/marketing-consent";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

export async function GET(request: NextRequest): Promise<Response> {
  const requestId=getRequestId(request);
  try {
    const session=await requireRequestSession(request);
    const scope=merchantScopeSchema.parse({
      organization:request.nextUrl.searchParams.get("organization"),
      location:request.nextUrl.searchParams.get("location"),
    });
    const customerId=z.uuid().parse(request.nextUrl.searchParams.get("customerId"));
    const context=await resolveMerchantContext({ session,
      organizationSlug:scope.organization,locationSlug:scope.location });
    return jsonSuccess({ consent:await getMarketingConsentReview(context,customerId) },
      { headers:{ "Cache-Control":"no-store" } });
  } catch(error) { return jsonError(error,requestId); }
}
