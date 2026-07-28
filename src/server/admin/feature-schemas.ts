import { z } from "zod";

export const featureKeys = [
  "ONLINE_BOOKING",
  "BASIC_CALENDAR",
  "STAFF_SCHEDULING",
  "CUSTOMER_CRM",
  "CUSTOMER_MEDIA",
  "BUSINESS_HOURS",
  "RESOURCE_MANAGEMENT",
  "LINE_NOTIFICATIONS",
  "EMAIL_NOTIFICATIONS",
  "DEPOSITS",
  "CANCELLATION_RULES",
  "MULTI_LOCATION",
  "CSV_EXPORT",
  "ADVANCED_REPORTS",
  "SCHEDULED_REPORTS",
  "CUSTOM_BRANDING",
  "AUDIT_VIEWER",
  "API_ACCESS",
  "WEBHOOK_ACCESS",
  "CUSTOM_DOMAIN",
  "WHITE_LABEL",
  "MEMBERSHIPS_PACKAGES",
  "AI_ASSISTANT",
  "MARKETPLACE",
] as const;

const setOverrideSchema = z
  .object({
    action: z.literal("SET"),
    featureKey: z.enum(featureKeys),
    overrideType: z.enum(["ALLOW", "DENY", "LIMIT"]),
    limitValue: z.int().min(0).max(1_000_000).optional(),
    reason: z.string().trim().min(3).max(500),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.overrideType === "LIMIT" &&
      value.limitValue === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["limitValue"],
        message: "限制覆寫需要設定數值。",
      });
    }
    if (
      value.overrideType !== "LIMIT" &&
      value.limitValue !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["limitValue"],
        message: "只有限制覆寫可以設定數值。",
      });
    }
  });

const revokeOverrideSchema = z
  .object({
    action: z.literal("REVOKE"),
    overrideId: z.uuid(),
  })
  .strict();

export const organizationFeatureOverrideSchema = z.union([
  setOverrideSchema,
  revokeOverrideSchema,
]);

export type OrganizationFeatureOverrideInput = z.infer<
  typeof organizationFeatureOverrideSchema
>;
