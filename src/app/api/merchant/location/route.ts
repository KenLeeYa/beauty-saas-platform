import type { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import {
  updateMerchantLocationProfile,
  updateMerchantLocationState,
} from "@/server/merchant/management";
import {
  merchantLocationUpdateSchema,
  merchantScopeSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";
import {listMerchantLocations, locationDirectorySchema} from "@/server/merchant/facility-directory";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    const scope = merchantScopeSchema.parse({organization: request.nextUrl.searchParams.get("organization"), location: request.nextUrl.searchParams.get("location")});
    const context = await resolveMerchantContext({session, organizationSlug: scope.organization, locationSlug: scope.location});
    const input = locationDirectorySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return jsonSuccess(await listMerchantLocations(context, input), {headers: {"x-request-id": requestId, "cache-control": "no-store"}});
  } catch (error) {return jsonError(error, requestId, request);}
}

export async function PATCH(request: NextRequest) {
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
    const input = merchantLocationUpdateSchema.parse(
      await request.json(),
    );
    if (input.action === "PROFILE") {
      return jsonSuccess(
        await updateMerchantLocationProfile({
          context,
          name: input.name,
          description: input.description,
          address: input.address,
          phone: input.phone,
          requestId,
        }),
        { headers: { "x-request-id": requestId } },
      );
    }
    return jsonSuccess(
      await updateMerchantLocationState({
        context,
        bookingState: input.bookingState,
        onlineBookingEnabled: input.onlineBookingEnabled,
        requestId,
      }),
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
