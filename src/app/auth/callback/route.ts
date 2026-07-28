import { NextResponse } from "next/server";

import { recordAudit } from "@/server/audit";
import { resolveSessionDestination } from "@/server/auth/destination";
import {
  createApplicationSession,
  setSessionCookies,
} from "@/server/auth/session";
import { resolveSupabaseProfile } from "@/server/auth/profile";
import { createSupabaseAuthClient } from "@/server/auth/supabase";
import { getServerEnv } from "@/server/env";
import {
  getRequestId,
  getTrustedClientIdentifier,
  hashAbuseIdentifier,
} from "@/server/security/request";

function safeNext(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 500)
    : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const env = getServerEnv();
  const appOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = safeNext(requestUrl.searchParams.get("next"));
  const requestId = getRequestId(request);
  const clientIdentifier = getTrustedClientIdentifier(request);

  if (!code) {
    return NextResponse.redirect(`${appOrigin}/?oauthError=callback-failed`);
  }

  try {
    const supabase = await createSupabaseAuthClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const authUser = data.user;
    const providers = Array.isArray(authUser?.app_metadata.providers)
      ? authUser.app_metadata.providers
      : [authUser?.app_metadata.provider];
    const email = authUser?.email?.trim().toLowerCase();

    if (
      error ||
      !authUser ||
      !email ||
      !authUser.email_confirmed_at ||
      !providers.includes("google")
    ) {
      throw new Error("OAUTH_IDENTITY_INVALID");
    }

    const profile = await resolveSupabaseProfile({
      authUserId: authUser.id,
      email,
      displayName:
        authUser.user_metadata.full_name ??
        authUser.user_metadata.name,
    });

    const material = await createApplicationSession({
      profileId: profile.id,
      userAgent: request.headers.get("user-agent"),
      ipIdentifier: clientIdentifier,
    });
    const fallback = await resolveSessionDestination({
      profileId: profile.id,
      platformRole: profile.platform_role,
    });
    const destination = requestedNext ?? fallback;
    const response = NextResponse.redirect(`${appOrigin}${destination}`);
    setSessionCookies(response, material);

    await recordAudit({
      actorProfileId: profile.id,
      action: "GOOGLE_LOGIN_SUCCESS",
      targetType: "AUTH",
      outcome: "SUCCESS",
      requestId,
      ipHash: hashAbuseIdentifier(clientIdentifier),
    });
    return response;
  } catch (error) {
    const code =
      error instanceof Error && error.message.includes("衝突")
        ? "account-conflict"
        : error instanceof Error && error.message.includes("停用")
          ? "account-disabled"
          : "callback-failed";
    return NextResponse.redirect(`${appOrigin}/?oauthError=${code}`);
  }
}
