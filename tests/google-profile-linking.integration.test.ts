import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "does not attach a new Google subject to an existing profile by email alone",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { resolveSupabaseProfile }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/auth/profile"),
    ]);
    const profile = await prisma.profiles.findUniqueOrThrow({
      where: { id: "33333333-3333-4333-8333-333333333301" },
      select: { auth_user_id: true, email: true },
    });
    await expect(resolveSupabaseProfile({
      authUserId: "88888888-8888-4888-8888-888888888888",
      email: profile.email.toUpperCase(),
    })).rejects.toMatchObject({ status: 409 });
    const after = await prisma.profiles.findUniqueOrThrow({
      where: { id: "33333333-3333-4333-8333-333333333301" },
      select: { auth_user_id: true },
    });
    expect(after.auth_user_id).toBe(profile.auth_user_id);
  },
);
