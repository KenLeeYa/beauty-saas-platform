import { NextResponse } from "next/server";

import { toPublicError } from "./errors";

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
): NextResponse {
  const mapped = toPublicError(error);
  return NextResponse.json(mapped.body, {
    status: mapped.status,
    headers: {
      "cache-control": "no-store",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}
