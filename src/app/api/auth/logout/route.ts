import { NextRequest, NextResponse } from "next/server";

import { recordAudit } from "@/server/audit";
import {
  assertSessionCsrf,
  clearSessionCookies,
  requireRequestSession,
  revokeSession,
} from "@/server/auth/session";
import { jsonError } from "@/server/http/response";
import { getRequestId } from "@/server/security/request";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    await revokeSession(session.id);
    await recordAudit({
      actorProfileId: session.profileId,
      action: "LOGOUT",
      targetType: "AUTH",
      targetId: session.id,
      outcome: "SUCCESS",
      requestId,
    });

    const response = NextResponse.json(
      { data: { success: true } },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
    clearSessionCookies(response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
