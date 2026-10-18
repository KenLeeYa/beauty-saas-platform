import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const businessHoursSchema = z
  .object({
    action: z.literal("BUSINESS_HOURS"),
    days: z.array(z.int().min(0).max(6)).min(1).max(7),
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .strict()
  .refine((value) => value.opensAt < value.closesAt, {
    path: ["closesAt"],
    message: "結束時間必須晚於開始時間。",
  })
  .refine((value) => new Set(value.days).size === value.days.length, {
    path: ["days"],
    message: "營業日不可重複。",
  });

const policiesSchema = z
  .object({
    action: z.literal("POLICIES"),
    slotIntervalMinutes: z.enum(["15", "30", "60"]).transform(Number),
    minimumLeadMinutes: z.int().min(0).max(43_200),
    maximumAdvanceDays: z.int().min(1).max(365),
    holdMinutes: z.int().min(5).max(60),
    cancellationCutoffHours: z.int().min(0).max(720),
    depositMode: z.enum(["NONE", "FIXED", "PERCENTAGE"]),
    depositAmountMinor: z.int().min(0).max(100_000_000),
    depositPercentage: z.int().min(0).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.depositMode === "FIXED" && value.depositAmountMinor <= 0) {
      context.addIssue({
        code: "custom",
        path: ["depositAmountMinor"],
        message: "固定訂金必須大於 0。",
      });
    }
    if (
      value.depositMode === "PERCENTAGE" &&
      value.depositPercentage <= 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["depositPercentage"],
        message: "訂金比例必須大於 0。",
      });
    }
  });

const notificationsSchema = z
  .object({
    action: z.literal("NOTIFICATIONS"),
    channels: z
      .array(z.enum(["LINE", "EMAIL"]))
      .min(1)
      .max(2),
  })
  .strict();

const simpleActionSchema = z
  .object({
    action: z.enum(["CREATE_TEST_BOOKING", "GO_LIVE"]),
  })
  .strict();

export const merchantSetupActionSchema = z.discriminatedUnion("action", [
  businessHoursSchema,
  policiesSchema,
  notificationsSchema,
  simpleActionSchema,
]);

export type MerchantSetupActionInput = z.infer<
  typeof merchantSetupActionSchema
>;
