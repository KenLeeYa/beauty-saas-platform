import { NextResponse } from "next/server";
import { requestLocale } from "@/lib/i18n/request";
import { translateError } from "@/lib/i18n/messages";

import { AppError, toPublicError } from "./errors";

export function jsonSuccess<T>(
  data: T,
  init?: ResponseInit,
): NextResponse<{ data: T }> {
  return NextResponse.json(
    { data },
    {
      ...init,
      headers: {
        "cache-control": "no-store",
        ...init?.headers,
      },
    },
  );
}

export function jsonError(
  error: unknown,
  requestId?: string,
  request?: Request,
): NextResponse {
  const mapped = toPublicError(error, requestLocale(request));
  return NextResponse.json(mapped.body, {
    status: mapped.status,
    headers: {
      "cache-control": "no-store",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}

// Mobile clients use a string error envelope; keep it distinct from merchant APIs.
export function mobileJsonError(error: unknown, request?: Request): Response {
  const locale = requestLocale(request);
  const mapped = toPublicError(error, locale);
  if (error instanceof AppError || mapped.status !== 500) {
    return NextResponse.json({ error: mapped.body.error.message }, {
      status: mapped.status, headers: { "cache-control": "no-store" },
    });
  }
  const detail = error instanceof Error ? error.message : "";
  const status = /authentication|session|LINE identity/.test(detail) ? 401 :
    /forbidden|cross-origin/.test(detail) ? 403 : 400;
  return NextResponse.json({ error: translateError(locale, status === 401 ? "登入已失效，請重新登入。" :
    status === 403 ? "您目前無法執行此操作。" : "無法處理請求，請確認資料後再試。") },
  { status, headers: { "cache-control": "no-store" } });
}
