import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";
import { setStaffCapability } from "@/server/staff/service-capability";

const capabilitySchema = z.object({
  assignmentId: z.uuid(),
  effectiveFrom: z.iso.datetime({ offset: true }),
  effectiveUntil: z.iso.datetime({ offset: true }).nullable(),
  onlineSelectable: z.boolean(),
  walkInEligible: z.boolean(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export async function PATCH(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    const scope = merchantScopeSchema.parse({
      organization: request.nextUrl.searchParams.get("organization"),
      location: request.nextUrl.searchParams.get("location"),
    });
    const context = await resolveMerchantContext({ session,
      organizationSlug: scope.organization, locationSlug: scope.location });
    const input = capabilitySchema.parse(await request.json());
    const result = await setStaffCapability({ context, assignmentId: input.assignmentId,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
      onlineSelectable: input.onlineSelectable,
      walkInEligible: input.walkInEligible, reason: input.reason });
    return jsonSuccess({ updated: true, ...result }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
