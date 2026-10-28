import "server-only";

import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalUrl = z.union([z.url(), z.literal("")]).optional();

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    PRISMA_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(10).default(5),
    PRISMA_POOL_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .default(20),
    NEXT_PUBLIC_APP_URL: z.url(),
    PUBLIC_APP_ORIGINS: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    CSRF_SECRET: z.string().min(32),
    ABUSE_HASH_SECRET: z.string().min(32),
    TOKEN_DERIVATION_SECRET: z.string().min(32),
    TRUSTED_CLIENT_IP_HEADER: z.string().default(""),
    NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED: booleanString,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().default(""),
    TURNSTILE_SECRET_KEY: z.string().default(""),
    TURNSTILE_EXPECTED_HOSTNAME: z.string().default(""),
    TURNSTILE_ALLOW_TEST_KEYS: booleanString,
    CRON_SECRET: z.string().min(32),
    LINE_CHANNEL_SECRET: z.string().default(""),
    LINE_CHANNEL_ACCESS_TOKEN: z.string().default(""),
    RESEND_API_KEY: z.string().default(""),
    EMAIL_FROM: z.string().default(""),
    ENABLE_LOCAL_AUTH_STUB: booleanString,
    PAYMENT_PROVIDER: z.enum(["disabled", "manual"]).default("disabled"),
    NOTIFICATION_PROVIDER: z
      .enum(["disabled", "resend", "line"])
      .default("disabled"),
    GOOGLE_REDIRECT_URL: optionalUrl,
  })
  .superRefine((env, context) => {
    if (env.APP_ENV !== "production") {
      return;
    }

    if (env.ENABLE_LOCAL_AUTH_STUB) {
      context.addIssue({
        code: "custom",
        path: ["ENABLE_LOCAL_AUTH_STUB"],
        message: "Local authentication must be disabled in production.",
      });
    }

    if (!env.TURNSTILE_SECRET_KEY || !env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      context.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "Turnstile must be configured in production.",
      });
    }

    if (env.TURNSTILE_ALLOW_TEST_KEYS) {
      context.addIssue({
        code: "custom",
        path: ["TURNSTILE_ALLOW_TEST_KEYS"],
        message: "Turnstile test keys are forbidden in production.",
      });
    }

    for (const key of [
      "SESSION_SECRET",
      "CSRF_SECRET",
      "ABUSE_HASH_SECRET",
      "TOKEN_DERIVATION_SECRET",
      "CRON_SECRET",
    ] as const) {
      if (env[key].startsWith("local-only-")) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be rotated for production.`,
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}

export function resetServerEnvForTests(): void {
  cachedEnv = undefined;
}

export function getAllowedOrigins(): ReadonlySet<string> {
  const origins = getServerEnv()
    .PUBLIC_APP_ORIGINS.split(",")
    .map((origin) => new URL(origin.trim()).origin);

  return new Set(origins);
}
