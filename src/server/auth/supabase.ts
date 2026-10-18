import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import { localLoginSchema } from "./local-auth";
import { resolveSupabaseProfile } from "./profile";

export function isGoogleLoginEnabled(): boolean {
  return getServerEnv().NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED;
}

export async function createSupabaseAuthClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        },
      },
    },
  );
}

export async function authenticateSupabasePasswordUser(
  input: unknown,
): Promise<{
  profileId: string;
  email: string;
  displayName: string;
  platformRole: string | null;
}> {
  const parsed = localLoginSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("BAD_REQUEST", "帳號或密碼格式不正確。", 400);
  }

  const env = getServerEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const { data, error } = await supabase.auth.signInWithPassword(
    parsed.data,
  );
  const email = data.user?.email?.trim().toLowerCase();

  if (
    error ||
    !data.user ||
    !email ||
    !data.user.email_confirmed_at
  ) {
    throw new AppError("UNAUTHENTICATED", "帳號或密碼不正確。", 401);
  }

  const profile = await resolveSupabaseProfile({
    authUserId: data.user.id,
    email,
    displayName:
      data.user.user_metadata.full_name ??
      data.user.user_metadata.name,
  });

  return {
    profileId: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    platformRole: profile.platform_role,
  };
}
