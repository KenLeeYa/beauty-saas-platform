import type { NextRequest } from "next/server";

import { AppError } from "@/server/http/errors";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { processLineWebhook } from "@/server/notifications/line-webhook";
import { getRequestId } from "@/server/security/request";

const MAX_BODY_BYTES = 256 * 1024;

type RouteContext = {
  params: Promise<{
    organizationSlug: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const requestId = getRequestId(request);

  try {
    const contentLength = Number(
      request.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_BYTES
    ) {
      throw new AppError("BAD_REQUEST", "Webhook 內容過大。", 413);
    }

    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      throw new AppError("BAD_REQUEST", "Webhook 內容過大。", 413);
    }

    const route = await context.params;
    const result = await processLineWebhook({
      organizationSlug: route.organizationSlug,
      body,
      signature: request.headers.get("x-line-signature") ?? "",
    });

    return jsonSuccess(result, {
      headers: {
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
