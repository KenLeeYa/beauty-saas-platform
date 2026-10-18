import type { NextRequest } from "next/server";

import { getServerEnv } from "@/server/env";
import { runNotificationCycle } from "@/server/notifications/dispatcher";
import { constantTimeEqual } from "@/server/security/crypto";
import { getRequestId } from "@/server/security/request";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${getServerEnv().CRON_SECRET}`;

  if (!constantTimeEqual(authorization, expected)) {
    return Response.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "排程驗證失敗。",
        },
      },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  }

  const result = await runNotificationCycle({
    workerId: `notification-cron:${requestId}`,
  });

  return Response.json(
    {
      data: result,
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}
