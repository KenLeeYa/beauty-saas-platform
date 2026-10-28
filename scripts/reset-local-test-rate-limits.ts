import { loadEnvFile } from "node:process";

import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  loadEnvFile(".env.development.local");
}

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required.");
}

const hostname = new URL(databaseUrl).hostname;
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  throw new Error(`Refusing to reset rate limits on non-local host: ${hostname}`);
}

if (process.env.APP_ENV === "production") {
  throw new Error("Refusing to reset rate limits in production mode.");
}

async function resetLocalTestRateLimits(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const result = await prisma.rate_limit_buckets.deleteMany();
    console.info(`Cleared ${result.count} local rate-limit buckets.`);
  } finally {
    await prisma.$disconnect();
  }
}

void resetLocalTestRateLimits().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
