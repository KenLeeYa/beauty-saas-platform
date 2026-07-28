import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];

function requireFile(path) {
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing required file: ${path}`);
  }
  return absolutePath;
}

const requiredFiles = [
  "vercel.json",
  "prisma/schema.prisma",
  "supabase/config.toml",
  "src/app/api/health/route.ts",
  "src/app/api/cron/notifications/route.ts",
  "src/app/api/webhooks/line/[organizationSlug]/route.ts",
  "src/server/env.ts",
];
for (const path of requiredFiles) {
  requireFile(path);
}

const expectedMigrations = [
  "20260728073300_beauty_platform_foundation.sql",
  "20260728073316_beauty_catalog_staff_crm.sql",
  "20260728073319_beauty_booking_engine.sql",
  "20260728073321_beauty_notifications_reporting.sql",
  "20260728073324_beauty_security_policies.sql",
  "20260728073336_beauty_plan_catalog.sql",
  "20260728083229_add_foreign_key_indexes.sql",
  "20260728085757_add_production_qa_and_one_hour_reminder.sql",
  "20260728085807_add_notification_cron_transport.sql",
  "20260728091758_remove_supabase_notification_cron_transport.sql",
];
const migrationDirectory = requireFile("supabase/migrations");
if (existsSync(migrationDirectory)) {
  const actualMigrations = new Set(readdirSync(migrationDirectory));
  for (const migration of expectedMigrations) {
    if (!actualMigrations.has(migration)) {
      failures.push(`Missing migration: ${migration}`);
    }
  }
}

const vercelPath = requireFile("vercel.json");
if (existsSync(vercelPath)) {
  const configuration = JSON.parse(readFileSync(vercelPath, "utf8"));
  const notificationCron = configuration.crons?.find(
    (cron) => cron.path === "/api/cron/notifications",
  );
  if (notificationCron?.schedule !== "*/5 * * * *") {
    failures.push("Production notification cron must run every five minutes.");
  }
  if (
    configuration.regions?.length !== 1 ||
    configuration.regions[0] !== "hnd1"
  ) {
    failures.push("Production functions must run in the Tokyo hnd1 region.");
  }
}

const examplePath = requireFile(".env.example");
const requiredEnvironment = [
  "APP_ENV",
  "DATABASE_URL",
  "DIRECT_URL",
  "PRISMA_CONNECTION_LIMIT",
  "PRISMA_POOL_TIMEOUT_SECONDS",
  "NEXT_PUBLIC_APP_URL",
  "PUBLIC_APP_ORIGINS",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED",
  "SESSION_SECRET",
  "CSRF_SECRET",
  "ABUSE_HASH_SECRET",
  "TOKEN_DERIVATION_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_HOSTNAME",
];
if (existsSync(examplePath)) {
  const example = readFileSync(examplePath, "utf8");
  for (const name of requiredEnvironment) {
    if (!new RegExp(`^${name}=`, "m").test(example)) {
      failures.push(`.env.example is missing ${name}.`);
    }
  }
}

if (process.env.APP_ENV === "production") {
  for (const name of requiredEnvironment) {
    if (!process.env[name]?.trim()) {
      failures.push(`Production environment is missing ${name}.`);
    }
  }
  if (process.env.ENABLE_LOCAL_AUTH_STUB !== "false") {
    failures.push("ENABLE_LOCAL_AUTH_STUB must be false in production.");
  }
  if (process.env.TURNSTILE_ALLOW_TEST_KEYS !== "false") {
    failures.push("TURNSTILE_ALLOW_TEST_KEYS must be false in production.");
  }
  if (process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED !== "true") {
    failures.push("NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED must be true in production.");
  }
  for (const name of [
    "SESSION_SECRET",
    "CSRF_SECRET",
    "ABUSE_HASH_SECRET",
    "TOKEN_DERIVATION_SECRET",
    "CRON_SECRET",
  ]) {
    const value = process.env[name] ?? "";
    if (value.length < 32 || value.startsWith("local-only-")) {
      failures.push(`${name} is not production-safe.`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    process.env.APP_ENV === "production"
      ? "Production source and runtime environment checks passed."
      : "Production source checks passed; runtime secrets are checked during deployment.",
  );
}
