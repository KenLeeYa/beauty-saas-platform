import { describe, expect, it } from "vitest";
import {
  authenticateDemoUser,
  demoCredentials,
  sessionDestination
} from "./demo-auth";

describe("demo authentication", () => {
  it("routes the merchant account to the shop dashboard", () => {
    const user = authenticateDemoUser(
      demoCredentials.merchant.email,
      demoCredentials.merchant.password
    );

    expect(user).toMatchObject({
      role: "merchant",
      tenantSlug: "demo"
    });
    expect(user && sessionDestination(user)).toBe("/app/appointments");
  });

  it("routes the customer account to the tenant booking page", () => {
    const user = authenticateDemoUser(
      demoCredentials.customer.email,
      demoCredentials.customer.password
    );

    expect(user).toMatchObject({
      role: "customer",
      tenantSlug: "demo"
    });
    expect(user && sessionDestination(user)).toBe("/t/demo/booking");
  });

  it("rejects an invalid password", () => {
    expect(authenticateDemoUser(demoCredentials.customer.email, "wrong-password")).toBeNull();
  });
});
