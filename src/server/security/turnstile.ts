import "server-only";

import { getServerEnv } from "../env";
import { AppError } from "../http/errors";

const VERIFY_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstile(input: {
  token: string;
  expectedAction: string;
  remoteIp?: string;
}): Promise<void> {
  const env = getServerEnv();

  if (
    env.APP_ENV !== "production" &&
    env.TURNSTILE_ALLOW_TEST_KEYS &&
    input.token === "local-test"
  ) {
    return;
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    throw new AppError(
      "FEATURE_UNAVAILABLE",
      "預約安全驗證尚未設定。",
      503,
    );
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: input.token,
  });
  if (input.remoteIp && input.remoteIp !== "unavailable") {
    body.set("remoteip", input.remoteIp);
  }

  let response: Response;
  try {
    response = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AppError(
      "FEATURE_UNAVAILABLE",
      "安全驗證服務暫時無法使用。",
      503,
    );
  }

  if (!response.ok) {
    throw new AppError(
      "FEATURE_UNAVAILABLE",
      "安全驗證服務暫時無法使用。",
      503,
    );
  }

  const result = (await response.json()) as TurnstileResponse;
  const expectedHostname = env.TURNSTILE_EXPECTED_HOSTNAME.trim();
  if (
    !result.success ||
    result.action !== input.expectedAction ||
    (expectedHostname && result.hostname !== expectedHostname)
  ) {
    throw new AppError("FORBIDDEN", "安全驗證失敗，請重新操作。", 403);
  }
}
