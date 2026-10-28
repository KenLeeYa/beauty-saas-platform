import "server-only";

import { randomUUID } from "node:crypto";

import { getAllowedOrigins, getServerEnv } from "../env";
import { AppError } from "../http/errors";
import { hmacSha256 } from "./crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function getRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError(
      "INVALID_ORIGIN",
      "此操作需要有效的來源資訊。",
      403,
    );
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new AppError("INVALID_ORIGIN", "來源格式無效。", 403);
  }

  if (!getAllowedOrigins().has(normalizedOrigin)) {
    throw new AppError("INVALID_ORIGIN", "不允許的請求來源。", 403);
  }
}

export function getTrustedClientIdentifier(request: Request): string {
  const trustedHeader = getServerEnv().TRUSTED_CLIENT_IP_HEADER.trim();
  if (!trustedHeader) {
    return "unavailable";
  }

  const value = request.headers.get(trustedHeader);
  if (!value) {
    return "unavailable";
  }

  return value.trim().slice(0, 256);
}

export function hashAbuseIdentifier(value: string): string {
  return hmacSha256(getServerEnv().ABUSE_HASH_SECRET, value);
}
