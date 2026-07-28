import { AppError } from "../http/errors";

export type OAuthErrorCode =
  | "not-configured"
  | "start-failed"
  | "callback-failed"
  | "account-conflict"
  | "account-disabled";

export function normalizeRelativeRedirect(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.slice(0, 500);
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return null;
  }

  return candidate;
}

export function getOAuthCallbackErrorCode(error: unknown): OAuthErrorCode {
  if (error instanceof AppError && error.code === "CONFLICT") {
    return "account-conflict";
  }
  if (error instanceof AppError && error.code === "FORBIDDEN") {
    return "account-disabled";
  }
  return "callback-failed";
}

export function getOAuthErrorMessage(
  code: string | null | undefined,
): string | undefined {
  switch (code) {
    case "not-configured":
      return "Google 登入尚未完成設定，請先使用 Email 登入。";
    case "start-failed":
      return "Google 登入暫時無法啟動，請稍後再試。";
    case "callback-failed":
      return "Google 登入驗證失敗，請重新嘗試。";
    case "account-conflict":
      return "此 Email 已連結其他登入帳號，請聯絡管理員。";
    case "account-disabled":
      return "此帳號已停用，請聯絡管理員。";
    default:
      return undefined;
  }
}
