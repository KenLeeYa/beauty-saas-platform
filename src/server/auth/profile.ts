import "server-only";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

function cleanDisplayName(value: unknown, email: string): string {
  if (typeof value !== "string") {
    return email.split("@")[0].slice(0, 80);
  }

  const cleaned = value.replace(/[\r\n]/g, " ").trim().slice(0, 80);
  return cleaned || email.split("@")[0].slice(0, 80);
}

export async function resolveSupabaseProfile(input: {
  authUserId: string;
  email: string;
  displayName?: unknown;
}) {
  const email = input.email.trim().toLowerCase();

  return prisma.$transaction(async (transaction) => {
    const [byAuthId, byEmail] = await Promise.all([
      transaction.profiles.findUnique({
        where: { auth_user_id: input.authUserId },
      }),
      transaction.profiles.findFirst({
        where: {
          email: {
            equals: email,
            mode: "insensitive",
          },
        },
      }),
    ]);

    if (byAuthId && byEmail && byAuthId.id !== byEmail.id) {
      throw new AppError(
        "CONFLICT",
        "此登入身分與既有帳號衝突，請聯絡平台管理員。",
        409,
      );
    }

    const existing = byAuthId ?? byEmail;
    if (existing) {
      if (!existing.is_active) {
        throw new AppError("FORBIDDEN", "此帳號已停用。", 403);
      }

      return transaction.profiles.update({
        where: { id: existing.id },
        data: {
          auth_user_id: input.authUserId,
          last_login_at: new Date(),
        },
      });
    }

    return transaction.profiles.create({
      data: {
        auth_user_id: input.authUserId,
        email,
        display_name: cleanDisplayName(input.displayName, email),
        last_login_at: new Date(),
      },
    });
  });
}
