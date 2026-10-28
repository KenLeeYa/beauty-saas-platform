import "server-only";

import type { feature_key } from "@prisma/client";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import {
  resolveEntitlement,
  type EntitlementDecision,
} from "./resolver";

const AVAILABLE_STATUSES = new Set(["TRIALING", "ACTIVE", "GRACE_PERIOD"]);

function globallyDisabledFeatures(): ReadonlySet<string> {
  return new Set(
    (process.env.DISABLED_FEATURES ?? "")
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean),
  );
}

export async function getEntitlement(
  organizationId: string,
  feature: feature_key,
  now = new Date(),
): Promise<EntitlementDecision> {
  const organization = await prisma.organizations.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      status: true,
      subscriptions: {
        where: {
          is_current: true,
        },
        select: {
          status: true,
          plan_versions: {
            select: {
              plan_entitlements: {
                where: {
                  feature_key: feature,
                },
                select: {
                  is_enabled: true,
                  limit_value: true,
                  soft_limit: true,
                },
                take: 1,
              },
            },
          },
        },
        take: 1,
      },
      organization_feature_overrides: {
        where: {
          feature_key: feature,
          revoked_at: null,
          effective_at: {
            lte: now,
          },
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
        },
        select: {
          override_type: true,
          limit_value: true,
        },
        orderBy: {
          created_at: "desc",
        },
        take: 1,
      },
    },
  });

  const subscription = organization?.subscriptions[0];
  const plan = subscription?.plan_versions.plan_entitlements[0];
  const override = organization?.organization_feature_overrides[0];

  return resolveEntitlement({
    globallyDisabled: globallyDisabledFeatures().has(feature),
    organizationAvailable: Boolean(
      organization && AVAILABLE_STATUSES.has(organization.status),
    ),
    subscriptionAvailable: Boolean(
      subscription && AVAILABLE_STATUSES.has(subscription.status),
    ),
    override: override
      ? {
          type: override.override_type,
          limit: override.limit_value,
        }
      : null,
    plan: plan
      ? {
          enabled: plan.is_enabled,
          limit: plan.limit_value,
          softLimit: plan.soft_limit,
        }
      : null,
  });
}

export async function requireEntitlement(
  organizationId: string,
  feature: feature_key,
): Promise<EntitlementDecision> {
  const decision = await getEntitlement(organizationId, feature);
  if (!decision.enabled) {
    const subscriptionUnavailable =
      decision.source === "ORGANIZATION_UNAVAILABLE" ||
      decision.source === "SUBSCRIPTION_UNAVAILABLE";
    throw new AppError(
      subscriptionUnavailable
        ? "SUBSCRIPTION_UNAVAILABLE"
        : "FEATURE_UNAVAILABLE",
      subscriptionUnavailable
        ? "目前訂閱狀態無法使用此功能。"
        : "目前方案未包含此功能。",
      403,
    );
  }
  return decision;
}
