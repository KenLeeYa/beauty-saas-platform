import type { NextRequest } from "next/server";

import {
  assertSessionCsrf,
  requireRequestSession,
} from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { AppError } from "@/server/http/errors";
import { resolveMerchantContext } from "@/server/merchant/context";
import { uploadMerchantMedia } from "@/server/merchant/media";
import {
  merchantMediaSchema,
  merchantScopeSchema,
} from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

export const runtime = "nodejs";

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
    const form = await request.formData();
    const input = merchantMediaSchema.parse({
      kind: form.get("kind"),
      targetId: form.get("targetId"),
    });
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("BAD_REQUEST", "請選擇圖片檔案。", 400);
    }
    return jsonSuccess(
      await uploadMerchantMedia({
        context,
        ...input,
        file,
        requestId,
      }),
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
