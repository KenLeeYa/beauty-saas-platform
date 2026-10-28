import { describe, expect, it } from "vitest";
import { hasPermission, isBranchAllowed, permissionsForRole } from "../src/index.js";

describe("authorization", () => {
  it("maps tenant owner to all permissions", () => {
    expect(permissionsForRole("TENANT_OWNER")).toContain("tenant.update");
    expect(permissionsForRole("TENANT_OWNER")).toContain("audit.read");
  });

  it("checks explicit permission grants", () => {
    expect(hasPermission({ permissions: ["appointment.read"] }, "appointment.read")).toBe(true);
    expect(hasPermission({ permissions: ["appointment.read"] }, "appointment.cancel")).toBe(false);
  });

  it("enforces branch scope lists", () => {
    expect(isBranchAllowed(["branch-a"], "branch-a")).toBe(true);
    expect(isBranchAllowed(["branch-a"], "branch-b")).toBe(false);
  });
});
