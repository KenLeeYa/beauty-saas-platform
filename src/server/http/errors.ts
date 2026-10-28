import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { localizedErrorMessage } from "./error-messages";
import type { Locale } from "@/lib/i18n/locale";
import { translateError } from "@/lib/i18n/messages";

export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_CSRF"
  | "INVALID_ORIGIN"
  | "FEATURE_UNAVAILABLE"
  | "SUBSCRIPTION_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Readonly<Record<string, unknown>>;

  get publicMessage(): string {
    const defaults: Record<AppErrorCode, string> = {
      BAD_REQUEST: "請檢查輸入內容。", UNAUTHENTICATED: "登入已失效，請重新登入。",
      FORBIDDEN: "您目前沒有執行此操作的權限。", NOT_FOUND: "找不到指定資料。",
      CONFLICT: "資料狀態已變更，請重新載入後再試。", RATE_LIMITED: "操作過於頻繁，請稍後再試。",
      INVALID_CSRF: "安全驗證已失效，請重新整理後再試。", INVALID_ORIGIN: "此來源無法執行操作，請從店家連結重新開啟。",
      FEATURE_UNAVAILABLE: "目前未啟用此功能。", SUBSCRIPTION_UNAVAILABLE: "目前訂閱無法使用此功能，請聯絡店家管理員。",
      INTERNAL_ERROR: "系統暫時無法處理此請求。",
    };
    return localizedErrorMessage(this.message, defaults[this.code]);
  }

  constructor(
    code: AppErrorCode,
    message: string,
    status: number,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toPublicError(error: unknown, locale: Locale = 'zh-TW') {
  const mapped = mapPublicError(error);
  mapped.body.error.message = translateError(locale, mapped.body.error.message);
  if (error instanceof ZodError) {
    const issues = mapped.body.error.details?.issues as { path: string; message: string }[];
    mapped.body.error.details = { issues: issues.map(issue => ({
      path: issue.path, message: translateError(locale, issue.message),
    })) };
  }
  return mapped;
}

function mapPublicError(error: unknown): {
  status: number;
  body: {
    error: {
      code: AppErrorCode;
      message: string;
      details?: Readonly<Record<string, unknown>>;
    };
  };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.publicMessage,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "BAD_REQUEST",
          message: "請檢查輸入內容。",
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: localizedErrorMessage(issue.message, {
                too_small: "輸入內容不足，請確認長度或最小值。",
                too_big: "輸入內容超過限制，請縮短內容或降低數值。",
                invalid_type: "請填寫正確類型的資料。",
                invalid_format: "格式不正確，請確認後再試。",
                invalid_value: "請選擇有效的選項。",
                unrecognized_keys: "請求包含不支援的欄位。",
                custom: "請檢查此欄位的輸入內容。",
                invalid_element: "資料項目格式不正確。",
                invalid_key: "資料欄位格式不正確。",
                invalid_union: "請選擇有效的資料格式。",
                not_multiple_of: "數值不符合指定的增減單位。",
              }[issue.code] ?? "請檢查此欄位的輸入內容。"),
            })),
          },
        },
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      body: {
        error: {
          code: "BAD_REQUEST",
          message: "請求內容格式無效。",
        },
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        status: 409,
        body: {
          error: {
            code: "CONFLICT",
            message: "資料已存在或與現有資料衝突。",
          },
        },
      };
    }
    if (error.code === "P2025") {
      return {
        status: 404,
        body: {
          error: {
            code: "NOT_FOUND",
            message: "找不到指定資料。",
          },
        },
      };
    }
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "系統暫時無法處理此請求。",
      },
    },
  };
}
