import { describe, expect, it } from "vitest";
import { ok } from "../src/index.js";

describe("api response helpers", () => {
  it("wraps success responses consistently", () => {
    expect(ok({ id: "tenant-a" }, undefined, "request-a")).toEqual({
      success: true,
      data: { id: "tenant-a" },
      meta: {},
      error: null,
      requestId: "request-a"
    });
  });
});
