import type { NextRequest } from "next/server";

import { createCustomerNote } from "@/modules/crm/server/customer-service";
import { createCustomerNoteSchema } from "@/modules/crm/server/schemas";
import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { requireModule } from "@/server/entitlements/module-visibility";
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
    await requireModule(context,"CUSTOMER_CRM");
    const input = createCustomerNoteSchema.parse(await request.json());
    return jsonSuccess(
      await createCustomerNote({ context, ...input, requestId }),
      {
        status: 201,
        headers: { "x-request-id": requestId },
      },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
