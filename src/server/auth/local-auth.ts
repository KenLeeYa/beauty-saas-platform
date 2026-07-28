import "server-only";

import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";

export const localLoginSchema = z
  .object({
    email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function authenticateLocalUser(input: unknown): Promise<{
  profileId: string;
  email: string;
  displayName: string;
  platformRole: string | null;
}> {
  const env = getServerEnv();
  if (env.APP_ENV === "production" || !env.ENABLE_LOCAL_AUTH_STUB) {
    throw new AppError(
      "NOT_FOUND",
      "此登入方式在目前環境不可用。",
      404,
    );
  }

  const parsed = localLoginSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("BAD_REQUEST", "帳號或密碼格式不正確。", 400);
  }

  const profile = await prisma.profiles.findFirst({
    where: {
      email: {
        equals: parsed.data.email,
        mode: "insensitive",
      },
      is_active: true,
    },
    select: {
      id: true,
      email: true,
      display_name: true,
      password_hash: true,
      platform_role: true,
    },
  });

  const valid =
    profile?.password_hash &&
    (await compare(parsed.data.password, profile.password_hash));

  if (!profile || !valid) {
    throw new AppError("UNAUTHENTICATED", "帳號或密碼不正確。", 401);
  }

  return {
    profileId: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    platformRole: profile.platform_role,
  };
}
