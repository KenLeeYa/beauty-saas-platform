import { describe, expect, it } from "vitest";

import { hasCapability } from "./capabilities";

describe("capability matrix", () => {
  it("allows an owner to manage subscriptions and bookings", () => {
    expect(
      hasCapability(["ORGANIZATION_OWNER"], "subscription.manage"),
    ).toBe(true);
    expect(hasCapability(["ORGANIZATION_OWNER"], "booking.manage")).toBe(true);
  });

  it("keeps finance read-only and away from sensitive customer data", () => {
    expect(hasCapability(["FINANCE_VIEWER"], "billing.read")).toBe(true);
    expect(hasCapability(["FINANCE_VIEWER"], "payment.manage")).toBe(false);
    expect(
      hasCapability(["FINANCE_VIEWER"], "customer.sensitive.read"),
    ).toBe(false);
  });

  it("limits service providers to their own work", () => {
    expect(
      hasCapability(["SERVICE_PROVIDER"], "booking.own.read"),
    ).toBe(true);
    expect(hasCapability(["SERVICE_PROVIDER"], "booking.read")).toBe(false);
    expect(hasCapability(["SERVICE_PROVIDER"], "report.read")).toBe(false);
  });

  it("combines capabilities from multiple verified memberships", () => {
    expect(
      hasCapability(
        ["SERVICE_PROVIDER", "FRONT_DESK"],
        "customer.manage",
      ),
    ).toBe(true);
  });
});
