import { z } from "zod";

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["console", "resend", "ses"]).default("console"),
  EMAIL_FROM: z.string().email()
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(env: NodeJS.ProcessEnv): AppEnv {
  return appEnvSchema.parse(env);
}
