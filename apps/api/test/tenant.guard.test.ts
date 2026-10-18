import { describe, expect, it } from "vitest";
import { isBranchAllowed } from "@beauty-saas/authorization";

describe("tenant and branch scope helpers", () => {
  it("allows owners with wildcard branch access", () => {
    expect(isBranchAllowed("*", "branch-a")).toBe(true);
  });

  it("blocks access outside assigned branches", () => {
    expect(isBranchAllowed(["branch-a"], "branch-b")).toBe(false);
  });
});
