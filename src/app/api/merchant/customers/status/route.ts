import type { NextRequest } from "next/server";
import { z } from "zod";

import { setCustomerStatus } from "@/modules/crm/server/customer-status";
import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const statusSchema = z.object({ customerId: z.uuid(),
  scope: z.enum(["ORGANIZATION", "LOCATION"]),
  statusKind: z.enum(["BLACKLIST", "VIP"]), enabled: z.boolean(),
  effectiveFrom: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  reviewAt: z.iso.datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(1).max(500) }).strict();

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
    const input = statusSchema.parse(await request.json());
    await setCustomerStatus({ context, customerId: input.customerId,
      scope: input.scope, statusKind: input.statusKind, enabled: input.enabled,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      reviewAt: input.reviewAt ? new Date(input.reviewAt) : null,
      reason: input.reason, requestId });
    return jsonSuccess({ updated: true }, { headers: { "x-request-id": requestId } });
  } catch (error) { return jsonError(error, requestId); }
}
