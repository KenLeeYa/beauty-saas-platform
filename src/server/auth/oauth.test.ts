import { describe, expect, it } from "vitest";

import { AppError } from "../http/errors";
import {
  getOAuthCallbackErrorCode,
  getOAuthErrorMessage,
  normalizeRelativeRedirect,
} from "./oauth";

describe("normalizeRelativeRedirect", () => {
  it("keeps a bounded application-relative destination", () => {
    expect(normalizeRelativeRedirect("/merchant/dashboard?tab=today")).toBe(
      "/merchant/dashboard?tab=today",
    );
    expect(normalizeRelativeRedirect(`/${"a".repeat(600)}`)).toHaveLength(500);
  });

  it("rejects absolute and protocol-relative destinations", () => {
    expect(normalizeRelativeRedirect("https://example.com")).toBeNull();
    expect(normalizeRelativeRedirect("//example.com")).toBeNull();
    expect(normalizeRelativeRedirect("/\\example.com")).toBeNull();
    expect(normalizeRelativeRedirect("/\nexample.com")).toBeNull();
    expect(normalizeRelativeRedirect(undefined)).toBeNull();
  });
});

describe("getOAuthCallbackErrorCode", () => {
  it("maps account state errors without relying on localized messages", () => {
    expect(
      getOAuthCallbackErrorCode(new AppError("CONFLICT", "conflict", 409)),
    ).toBe("account-conflict");
    expect(
      getOAuthCallbackErrorCode(new AppError("FORBIDDEN", "disabled", 403)),
    ).toBe("account-disabled");
    expect(getOAuthCallbackErrorCode(new Error("provider failed"))).toBe(
      "callback-failed",
    );
  });
});

describe("getOAuthErrorMessage", () => {
  it("returns a user-facing message only for known OAuth errors", () => {
    expect(getOAuthErrorMessage("callback-failed")).toContain("驗證失敗");
    expect(getOAuthErrorMessage("unknown")).toBeUndefined();
  });
});
