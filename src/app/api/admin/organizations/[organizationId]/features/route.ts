import { NextRequest } from "next/server";
import { z } from "zod";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { updateOrganizationFeatureOverride } from "@/server/admin/features";
import { organizationFeatureOverrideSchema } from "@/server/admin/feature-schemas";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getRequestId } from "@/server/security/request";

const pathSchema = z
  .object({
    organizationId: z.uuid(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      organizationId: string;
    }>;
  },
) {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    const { organizationId } = pathSchema.parse(await context.params);
    await consumeRateLimit({
      scope: "admin-organization-feature-override",
      identifier: session.profileId,
      limit: 120,
      windowMs: 60 * 60_000,
    });
    const payload = organizationFeatureOverrideSchema.parse(
      await request.json(),
    );
    return jsonSuccess(
      await updateOrganizationFeatureOverride({
        session,
        organizationId,
        payload,
        requestId,
      }),
      {
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return jsonError(error, requestId, request);
  }
}
