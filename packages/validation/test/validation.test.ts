import { describe, expect, it } from "vitest";
import { updateAppointmentStatusSchema, tenantSlugSchema } from "../src/index.js";

describe("tenant slug validation", () => {
  it("accepts url-safe slugs", () => {
    expect(tenantSlugSchema.parse("demo-spa")).toBe("demo-spa");
  });

  it("rejects unsafe slugs", () => {
    expect(() => tenantSlugSchema.parse("Demo Spa")).toThrow();
  });
});

describe("appointment status validation", () => {
  it("accepts supported appointment status updates", () => {
    expect(updateAppointmentStatusSchema.parse({ status: "CONFIRMED" })).toEqual({ status: "CONFIRMED" });
  });

  it("rejects unsupported appointment status updates", () => {
    expect(() => updateAppointmentStatusSchema.parse({ status: "WAITLISTED" })).toThrow();
  });
});
