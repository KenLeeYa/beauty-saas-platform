export type EntitlementSource =
  | "GLOBAL_KILL_SWITCH"
  | "ORGANIZATION_UNAVAILABLE"
  | "SUBSCRIPTION_UNAVAILABLE"
  | "OVERRIDE_DENY"
  | "OVERRIDE_ALLOW"
  | "OVERRIDE_LIMIT"
  | "PLAN"
  | "DEFAULT_DENY";

export type EntitlementDecision = {
  enabled: boolean;
  limit: number | null;
  softLimit: boolean;
  source: EntitlementSource;
};

export type EntitlementResolutionInput = {
  globallyDisabled: boolean;
  organizationAvailable: boolean;
  subscriptionAvailable: boolean;
  override:
    | {
        type: "ALLOW" | "DENY" | "LIMIT";
        limit: number | null;
      }
    | null;
  plan:
    | {
        enabled: boolean;
        limit: number | null;
        softLimit: boolean;
      }
    | null;
};

export function resolveEntitlement(
  input: EntitlementResolutionInput,
): EntitlementDecision {
  if (input.globallyDisabled) {
    return {
      enabled: false,
      limit: null,
      softLimit: false,
      source: "GLOBAL_KILL_SWITCH",
    };
  }

  if (!input.organizationAvailable) {
    return {
      enabled: false,
      limit: null,
      softLimit: false,
      source: "ORGANIZATION_UNAVAILABLE",
    };
  }

  if (!input.subscriptionAvailable) {
    return {
      enabled: false,
      limit: null,
      softLimit: false,
      source: "SUBSCRIPTION_UNAVAILABLE",
    };
  }

  if (input.override?.type === "DENY") {
    return {
      enabled: false,
      limit: null,
      softLimit: false,
      source: "OVERRIDE_DENY",
    };
  }

  if (input.override?.type === "ALLOW") {
    return {
      enabled: true,
      limit: null,
      softLimit: false,
      source: "OVERRIDE_ALLOW",
    };
  }

  if (input.override?.type === "LIMIT") {
    return {
      enabled: true,
      limit: input.override.limit,
      softLimit: false,
      source: "OVERRIDE_LIMIT",
    };
  }

  if (input.plan) {
    return {
      enabled: input.plan.enabled,
      limit: input.plan.limit,
      softLimit: input.plan.softLimit,
      source: "PLAN",
    };
  }

  return {
    enabled: false,
    limit: null,
    softLimit: false,
    source: "DEFAULT_DENY",
  };
}
