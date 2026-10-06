import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { assertCapability, requireLocation } from "@/server/authorization/context";
import { configureWalkInPolicy, getWalkInPolicy } from "@/server/booking/walkin-policy";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const schema = z.object({ earliestStartMinutes: z.number().int().min(0).max(1440),
  setupBufferMinutes: z.number().int().min(0).max(240),
  onlineMinimumAdvanceApplies: z.boolean(), expectedVersion: z.number().int().positive().optional(),
}).strict();

async function contextFor(request: NextRequest) {
  const session = await requireRequestSession(request);
  const scope = merchantScopeSchema.parse({
    organization: request.nextUrl.searchParams.get("organization"),
    location: request.nextUrl.searchParams.get("location"),
  });
  const context = await resolveMerchantContext({ session,
    organizationSlug: scope.organization, locationSlug: scope.location });
  assertCapability(context,"location.manage");
  return { session, context, location: requireLocation(context) };
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { context, location } = await contextFor(request);
    return jsonSuccess({ policy: await getWalkInPolicy(context.organization.id,location.id) });
  } catch (error) { return jsonError(error,requestId); }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { session, context } = await contextFor(request);
    assertSessionCsrf(request,session);
    const input = schema.parse(await request.json());
    return jsonSuccess({ policy: await configureWalkInPolicy({ context,...input,requestId }) });
  } catch (error) { return jsonError(error,requestId); }
}
