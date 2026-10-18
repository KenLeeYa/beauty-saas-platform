import { z } from "zod";

import { bookingStatuses } from "../booking/state-machine";

export const merchantScopeSchema = z.object({
  organization: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  location: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

export const merchantBookingStatusSchema = z.object({
  bookingId: z.uuid(),
  nextStatus: z.enum(bookingStatuses),
  expectedVersion: z.int().min(1),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const merchantPaymentSchema = z.object({
  bookingId: z.uuid(),
  amountMinor: z.int().positive().max(100_000_000),
  expectedVersion: z.int().min(1),
  method: z
    .enum(["CASH", "MANUAL_TRANSFER", "LINE_PAY_MANUAL", "OTHER"])
    .default("MANUAL_TRANSFER"),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
}).strict();

export const createMerchantServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  variantName: z.string().trim().min(1).max(120),
  categoryName: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1_000).default(""),
  durationMinutes: z.int().min(15).max(720),
  priceMinor: z.int().min(0).max(100_000_000),
  preBufferMinutes: z.int().min(0).max(240).default(0),
  postBufferMinutes: z.int().min(0).max(240).default(0),
}).strict();

export const createMerchantStaffSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).default(""),
  skills: z.array(z.string().trim().min(1).max(80)).max(30),
}).strict();

export const createMerchantResourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  typeName: z.string().trim().min(1).max(120),
  kind: z.enum([
    "CHAIR",
    "NAIL_TABLE",
    "EYELASH_BED",
    "SPA_ROOM",
    "EQUIPMENT",
    "OTHER",
  ]),
}).strict();

export const createMerchantCustomerSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(32),
  email: z.union([z.email(), z.literal("")]).optional(),
  birthday: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional(),
}).strict();

export const updateMerchantCustomerSchema = z
  .object({
    customerId: z.uuid(),
    birthday: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
      .optional(),
    depositMode: z
      .enum(["DEFAULT", "REQUIRED", "EXEMPT"])
      .optional(),
    isBlacklisted: z.boolean().optional(),
    blacklistReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.birthday === undefined &&
      value.depositMode === undefined &&
      value.isBlacklisted === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "至少需要更新一個顧客欄位。",
      });
    }
    if (value.isBlacklisted && !value.blacklistReason) {
      context.addIssue({
        code: "custom",
        path: ["blacklistReason"],
        message: "加入黑名單時必須填寫原因。",
      });
    }
  });

export const merchantServiceToggleSchema = z.object({
  locationServiceId: z.uuid(),
  onlineBookingEnabled: z.boolean(),
}).strict();

export const merchantServiceBufferSchema = z.object({
  action: z.literal("UPDATE_BUFFERS"),
  locationServiceId: z.uuid(),
  preBufferMinutes: z.int().min(0).max(240),
  postBufferMinutes: z.int().min(0).max(240),
}).strict();

export const merchantServiceUpdateSchema = z.union([
  merchantServiceToggleSchema,
  merchantServiceBufferSchema,
]);

export const merchantLocationUpdateSchema = z.discriminatedUnion(
  "action",
  [
    z
      .object({
        action: z.literal("BOOKING_STATE"),
        bookingState: z.enum(["OPEN", "PAUSED", "CLOSED"]),
        onlineBookingEnabled: z.boolean(),
      })
      .strict(),
    z
      .object({
        action: z.literal("PROFILE"),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1_000),
        address: z.string().trim().max(500),
        phone: z.string().trim().max(32),
      })
      .strict(),
  ],
);

const merchantScheduleSegmentSchema = z
  .object({
    startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine((segment) => segment.startsAt < segment.endsAt, {
    message: "結束時間必須晚於開始時間。",
    path: ["endsAt"],
  });

export const merchantDayScheduleSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mode: z.enum(["NORMAL", "CUSTOM", "CLOSED"]),
    reason: z.string().trim().max(240).default(""),
    segments: z.array(merchantScheduleSegmentSchema).max(3).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "CUSTOM" && value.segments.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["segments"],
        message: "自訂營業日必須設定至少一個時段。",
      });
    }
    if (value.mode !== "CUSTOM" && value.segments.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["segments"],
        message: "只有自訂營業日可以設定時段。",
      });
    }
    const sorted = [...value.segments].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index - 1].endsAt > sorted[index].startsAt) {
        context.addIssue({
          code: "custom",
          path: ["segments", index],
          message: "營業時段不可重疊。",
        });
      }
    }
  });

export const merchantBookingSettingsSchema = z
  .object({
    onlineBookingEnabled: z.boolean(),
    depositsEnabled: z.boolean(),
    depositMode: z.enum(["FIXED", "PERCENTAGE"]),
    depositAmountMinor: z.int().min(0).max(100_000_000),
    depositPercentage: z.number().min(0).max(100),
    customerCancellationEnabled: z.boolean(),
    customerRescheduleEnabled: z.boolean(),
    cancellationCutoffHours: z.int().min(0).max(720),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.depositsEnabled &&
      value.depositMode === "FIXED" &&
      value.depositAmountMinor <= 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["depositAmountMinor"],
        message: "固定訂金必須大於零。",
      });
    }
    if (
      value.depositsEnabled &&
      value.depositMode === "PERCENTAGE" &&
      value.depositPercentage <= 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["depositPercentage"],
        message: "訂金比例必須大於零。",
      });
    }
  });

export const merchantOrganizationProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    businessName: z.string().trim().min(1).max(200),
    entityType: z.enum(["SOLE_PROPRIETOR", "COMPANY"]),
    email: z.email(),
    phone: z.string().trim().min(8).max(32),
    brandDescription: z.string().trim().max(1_000),
  })
  .strict();

export const merchantMediaSchema = z
  .object({
    kind: z.enum([
      "ORGANIZATION_LOGO",
      "ORGANIZATION_COVER",
      "LOCATION_COVER",
      "SERVICE_IMAGE",
      "STAFF_PHOTO",
    ]),
    targetId: z.uuid(),
  })
  .strict();
