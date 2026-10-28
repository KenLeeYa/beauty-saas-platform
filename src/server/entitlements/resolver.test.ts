import { describe, expect, it } from "vitest";

import { resolveEntitlement } from "./resolver";

const baseInput = {
  globallyDisabled: false,
  organizationAvailable: true,
  subscriptionAvailable: true,
  override: null,
  plan: {
    enabled: true,
    limit: 3,
    softLimit: false,
  },
} as const;

describe("entitlement precedence", () => {
  it("applies the global kill switch before every other source", () => {
    expect(
      resolveEntitlement({
        ...baseInput,
        globallyDisabled: true,
        override: { type: "ALLOW", limit: null },
      }).source,
    ).toBe("GLOBAL_KILL_SWITCH");
  });

  it("blocks unavailable subscriptions before an allow override", () => {
    expect(
      resolveEntitlement({
        ...baseInput,
        subscriptionAvailable: false,
        override: { type: "ALLOW", limit: null },
      }).source,
    ).toBe("SUBSCRIPTION_UNAVAILABLE");
  });

  it("lets an explicit deny override the plan", () => {
    const decision = resolveEntitlement({
      ...baseInput,
      override: { type: "DENY", limit: null },
    });
    expect(decision.enabled).toBe(false);
    expect(decision.source).toBe("OVERRIDE_DENY");
  });

  it("uses a time-filtered limit override before the plan", () => {
    expect(
      resolveEntitlement({
        ...baseInput,
        override: { type: "LIMIT", limit: 8 },
      }),
    ).toMatchObject({
      enabled: true,
      limit: 8,
      source: "OVERRIDE_LIMIT",
    });
  });
});
