import "server-only";

import { PrismaClient } from "@prisma/client";

import { getServerEnv } from "@/server/env";

const globalForPrisma = globalThis as typeof globalThis & {
  beautyPrisma?: PrismaClient;
};

function getDatabaseUrl(): string {
  const env = getServerEnv();
  const databaseUrl = new URL(env.DATABASE_URL);

  databaseUrl.searchParams.set(
    "connection_limit",
    String(env.PRISMA_CONNECTION_LIMIT),
  );
  databaseUrl.searchParams.set(
    "pool_timeout",
    String(env.PRISMA_POOL_TIMEOUT_SECONDS),
  );

  return databaseUrl.toString();
}

export const prisma =
  globalForPrisma.beautyPrisma ??
  new PrismaClient({
    datasourceUrl: getDatabaseUrl(),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.beautyPrisma = prisma;
}
