import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

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

export function toPublicError(error: unknown): {
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
          message: error.message,
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
              message: issue.message,
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
