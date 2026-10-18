import { NextResponse } from "next/server";

import { normalizeRelativeRedirect } from "@/server/auth/oauth";
import {
  createSupabaseAuthClient,
  isGoogleLoginEnabled,
} from "@/server/auth/supabase";
import { getServerEnv } from "@/server/env";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getTrustedClientIdentifier } from "@/server/security/request";

export async function GET(request: Request): Promise<NextResponse> {
  const env = getServerEnv();
  const appOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;

  if (!isGoogleLoginEnabled()) {
    return NextResponse.redirect(`${appOrigin}/?oauthError=not-configured`);
  }

  try {
    await consumeRateLimit({
      scope: "google-oauth-start",
      identifier: getTrustedClientIdentifier(request),
      limit: 20,
      windowMs: 15 * 60_000,
    });

    const requestUrl = new URL(request.url);
    const next =
      normalizeRelativeRedirect(requestUrl.searchParams.get("next")) ?? "/";
    const supabase = await createSupabaseAuthClient();
    const redirectTo = `${appOrigin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: "openid email profile",
      },
    });

    if (error || !data.url) {
      throw error ?? new Error("OAuth redirect missing.");
    }

    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(`${appOrigin}/?oauthError=start-failed`);
  }
}
