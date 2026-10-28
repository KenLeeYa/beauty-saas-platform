import "server-only";

import { Prisma } from "@prisma/client";

import type { ApplicationSession } from "../auth/session";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import {
  featureKeys,
  type OrganizationFeatureOverrideInput,
} from "./feature-schemas";

export type AdminOrganizationFeaturesData = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  subscription: {
    status: string;
    planName: string;
    planVersion: number;
  } | null;
  features: Array<{
    key: (typeof featureKeys)[number];
    planEnabled: boolean;
    planLimit: number | null;
    softLimit: boolean;
    activeOverride: {
      id: string;
      type: string;
      limitValue: number | null;
      reason: string;
      effectiveAt: string;
      expiresAt: string | null;
    } | null;
  }>;
};

function requirePlatformAdmin(session: ApplicationSession): void {
  if (session.platformRole !== "PLATFORM_ADMIN") {
    throw new AppError("NOT_FOUND", "找不到指定頁面。", 404);
  }
}

export async function getAdminOrganizationFeatures(
  session: ApplicationSession,
  organizationId: string,
): Promise<AdminOrganizationFeaturesData> {
  requirePlatformAdmin(session);
  const now = new Date();
  const organization = await prisma.organizations.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      subscriptions: {
        where: {
          is_current: true,
        },
        take: 1,
        select: {
          status: true,
          plan_versions: {
            select: {
              version: true,
              plans: {
                select: {
                  display_name: true,
                },
              },
              plan_entitlements: {
                select: {
                  feature_key: true,
                  is_enabled: true,
                  limit_value: true,
                  soft_limit: true,
                },
              },
            },
          },
        },
      },
      organization_feature_overrides: {
        where: {
          revoked_at: null,
          effective_at: {
            lte: now,
          },
          OR: [
            {
              expires_at: null,
            },
            {
              expires_at: {
                gt: now,
              },
            },
          ],
        },
        orderBy: {
          effective_at: "desc",
        },
        select: {
          id: true,
          feature_key: true,
          override_type: true,
          limit_value: true,
          reason: true,
          effective_at: true,
          expires_at: true,
        },
      },
    },
  });
  if (!organization) {
    throw new AppError("NOT_FOUND", "找不到商家資料。", 404);
  }

  const subscription = organization.subscriptions[0];
  const entitlementMap = new Map(
    subscription?.plan_versions.plan_entitlements.map((entitlement) => [
      entitlement.feature_key,
      entitlement,
    ]) ?? [],
  );
  const overrideMap = new Map(
    organization.organization_feature_overrides.map((override) => [
      override.feature_key,
      override,
    ]),
  );

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
    },
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.plan_versions.plans.display_name,
          planVersion: subscription.plan_versions.version,
        }
      : null,
    features: featureKeys.map((key) => {
      const entitlement = entitlementMap.get(key);
      const override = overrideMap.get(key);
      return {
        key,
        planEnabled: entitlement?.is_enabled ?? false,
        planLimit: entitlement?.limit_value ?? null,
        softLimit: entitlement?.soft_limit ?? false,
        activeOverride: override
          ? {
              id: override.id,
              type: override.override_type,
              limitValue: override.limit_value,
              reason: override.reason,
              effectiveAt: override.effective_at.toISOString(),
              expiresAt: override.expires_at?.toISOString() ?? null,
            }
          : null,
      };
    }),
  };
}

export async function updateOrganizationFeatureOverride(input: {
  session: ApplicationSession;
  organizationId: string;
  payload: OrganizationFeatureOverrideInput;
  requestId: string;
}): Promise<{ success: true }> {
  requirePlatformAdmin(input.session);
  const now = new Date();

  await prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`
          select id
          from public.organizations
          where id = ${input.organizationId}::uuid
          for update
        `,
      );
      const organization = await transaction.organizations.findUnique({
        where: {
          id: input.organizationId,
        },
        select: {
          id: true,
        },
      });
      if (!organization) {
        throw new AppError("NOT_FOUND", "找不到商家資料。", 404);
      }

      if (input.payload.action === "SET") {
        const expiresAt = input.payload.expiresAt
          ? new Date(input.payload.expiresAt)
          : null;
        if (expiresAt && expiresAt <= now) {
          throw new AppError(
            "BAD_REQUEST",
            "覆寫到期時間必須晚於目前時間。",
            400,
          );
        }
        await transaction.organization_feature_overrides.updateMany({
          where: {
            organization_id: input.organizationId,
            feature_key: input.payload.featureKey,
            revoked_at: null,
          },
          data: {
            revoked_at: now,
            revoked_by: input.session.profileId,
          },
        });
        const created =
          await transaction.organization_feature_overrides.create({
            data: {
              organization_id: input.organizationId,
              feature_key: input.payload.featureKey,
              override_type: input.payload.overrideType,
              limit_value:
                input.payload.overrideType === "LIMIT"
                  ? input.payload.limitValue
                  : null,
              reason: input.payload.reason,
              effective_at: now,
              expires_at: expiresAt,
              created_by: input.session.profileId,
            },
            select: {
              id: true,
            },
          });
        await transaction.audit_logs.create({
          data: {
            organization_id: input.organizationId,
            actor_profile_id: input.session.profileId,
            action: "ORGANIZATION_FEATURE_OVERRIDE_SET",
            target_type: "ORGANIZATION_FEATURE_OVERRIDE",
            target_id: created.id,
            outcome: "SUCCESS",
            request_id: input.requestId,
            after_json: {
              featureKey: input.payload.featureKey,
              overrideType: input.payload.overrideType,
              limitValue: input.payload.limitValue ?? null,
              expiresAt: input.payload.expiresAt ?? null,
            },
          },
        });
      } else {
        const override =
          await transaction.organization_feature_overrides.findFirst({
            where: {
              id: input.payload.overrideId,
              organization_id: input.organizationId,
              revoked_at: null,
            },
            select: {
              id: true,
              feature_key: true,
              override_type: true,
            },
          });
        if (!override) {
          throw new AppError(
            "NOT_FOUND",
            "找不到有效的功能覆寫。",
            404,
          );
        }
        await transaction.organization_feature_overrides.update({
          where: {
            id: override.id,
          },
          data: {
            revoked_at: now,
            revoked_by: input.session.profileId,
          },
        });
        await transaction.audit_logs.create({
          data: {
            organization_id: input.organizationId,
            actor_profile_id: input.session.profileId,
            action: "ORGANIZATION_FEATURE_OVERRIDE_REVOKE",
            target_type: "ORGANIZATION_FEATURE_OVERRIDE",
            target_id: override.id,
            outcome: "SUCCESS",
            request_id: input.requestId,
            before_json: {
              featureKey: override.feature_key,
              overrideType: override.override_type,
            },
            after_json: {
              revokedAt: now.toISOString(),
            },
          },
        });
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );

  return { success: true };
}
