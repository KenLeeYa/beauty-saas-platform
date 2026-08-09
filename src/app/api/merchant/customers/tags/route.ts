import type { NextRequest } from "next/server";

import {
  createCustomerTag,
  setCustomerTagAssignment,
} from "@/modules/crm/server/customer-service";
import { customerTagCommandSchema } from "@/modules/crm/server/schemas";
import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

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
    const command = customerTagCommandSchema.parse(await request.json());

    const result =
      command.action === "CREATE"
        ? await createCustomerTag({ context, ...command, requestId })
        : await setCustomerTagAssignment({
            context,
            customerId: command.customerId,
            tagId: command.tagId,
            assigned: command.action === "ASSIGN",
            requestId,
          });
    return jsonSuccess(result, {
      status: command.action === "CREATE" ? 201 : 200,
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
