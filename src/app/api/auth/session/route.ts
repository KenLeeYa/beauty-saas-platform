import { NextRequest } from "next/server";

import { resolveSessionDestination } from "@/server/auth/destination";
import { requireRequestSession } from "@/server/auth/session";
import { jsonError, jsonSuccess } from "@/server/http/response";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRequestSession(request);
    const redirectTo = await resolveSessionDestination({
      profileId: session.profileId,
      platformRole: session.platformRole,
    });

    return jsonSuccess({
      email: session.email,
      displayName: session.displayName,
      platformRole: session.platformRole,
      expiresAt: session.expiresAt.toISOString(),
      redirectTo,
    });
  } catch (error) {
    return jsonError(error);
  }
}
