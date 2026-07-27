import { describe, expect, it } from "vitest";
import { tenantSlugSchema, updateAppointmentStatusSchema, updateBookingSlotSchema } from "../src/index.js";

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

describe("booking slot validation", () => {
  it("accepts supported booking slot updates", () => {
    expect(
      updateBookingSlotSchema.parse({
        branchId: "branch-xinyi",
        staffId: "staff-mia",
        date: "2026-07-27",
        time: "10:00",
        isOpen: false
      })
    ).toEqual({
      branchId: "branch-xinyi",
      staffId: "staff-mia",
      date: "2026-07-27",
      time: "10:00",
      isOpen: false
    });
  });

  it("rejects invalid booking slot times", () => {
    expect(() =>
      updateBookingSlotSchema.parse({
        branchId: "branch-xinyi",
        staffId: "staff-mia",
        date: "2026-07-27",
        time: "10",
        isOpen: false
      })
    ).toThrow();
  });
});
