import { NextResponse } from "next/server";
import { z } from "zod";

import { startMobileLineLogin } from "@/server/auth/line-oauth";
import { getServerEnv } from "@/server/env";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getTrustedClientIdentifier } from "@/server/security/request";

const storeSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);

export async function GET(request: Request): Promise<Response> {
  const origin = new URL(getServerEnv().NEXT_PUBLIC_APP_URL).origin;
  try {
    const store = storeSchema.parse(new URL(request.url).searchParams.get("store"));
    await consumeRateLimit({ scope: "line-backoffice-oauth-start",
      identifier: getTrustedClientIdentifier(request), limit: 15,
      windowMs: 15 * 60_000 });
    return await startMobileLineLogin(request, store, undefined, true);
  } catch {
    return NextResponse.redirect(`${origin}/?oauthError=line-start-failed`);
  }
}
