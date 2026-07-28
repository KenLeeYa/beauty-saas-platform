import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { hashAbuseIdentifier } from "./request";

type RateLimitRow = {
  count: number;
};

export type RateLimitInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

export async function consumeRateLimit(input: RateLimitInput): Promise<void> {
  const now = input.now ?? new Date();
  const windowStartMs =
    Math.floor(now.getTime() / input.windowMs) * input.windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + input.windowMs * 2);
  const identifierHash = hashAbuseIdentifier(input.identifier);

  const rows = await prisma.$queryRaw<RateLimitRow[]>(Prisma.sql`
    insert into public.rate_limit_buckets (
      scope,
      identifier_hash,
      window_start,
      count,
      expires_at
    )
    values (
      ${input.scope},
      ${identifierHash},
      ${windowStart},
      1,
      ${expiresAt}
    )
    on conflict (scope, identifier_hash, window_start)
    do update set
      count = public.rate_limit_buckets.count + 1,
      expires_at = excluded.expires_at,
      updated_at = now()
    returning count
  `);

  if ((rows[0]?.count ?? input.limit + 1) > input.limit) {
    throw new AppError(
      "RATE_LIMITED",
      "操作次數過多，請稍後再試。",
      429,
    );
  }
}
