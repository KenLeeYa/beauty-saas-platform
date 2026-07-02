import { describe, expect, it } from "vitest";
import { tenantSlugSchema } from "../src/index.js";

describe("tenant slug validation", () => {
  it("accepts url-safe slugs", () => {
    expect(tenantSlugSchema.parse("demo-spa")).toBe("demo-spa");
  });

  it("rejects unsafe slugs", () => {
    expect(() => tenantSlugSchema.parse("Demo Spa")).toThrow();
  });
});
