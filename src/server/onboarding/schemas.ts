import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(3, "商家網址至少需要 3 個字元。")
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "商家網址只能使用小寫英文字母、數字與連字號。",
  );

export const merchantApplicationFormSchema = z
  .object({
    businessName: z.string().trim().min(2).max(200),
    contactName: z.string().trim().min(1).max(120),
    contactEmail: z.email().max(254),
    contactPhone: z.string().trim().min(8).max(32),
    industryType: z.enum([
      "BEAUTY",
      "SPA",
      "MASSAGE",
      "NAIL",
      "EYELASH",
      "HAIR",
      "OTHER",
    ]),
    desiredSlug: slugSchema,
    initialLocationName: z.string().trim().min(1).max(160),
    initialLocationAddress: z.string().trim().min(3).max(500),
    applicantNote: z.string().trim().max(1_000).optional(),
    expectedVersion: z.int().positive().optional(),
    submit: z.boolean().default(false),
  })
  .strict();

export const adminMerchantApplicationReviewSchema = z
  .object({
    action: z.enum([
      "START_REVIEW",
      "REQUEST_INFO",
      "APPROVE",
      "REJECT",
    ]),
    expectedVersion: z.int().positive(),
    reason: z.string().trim().max(1_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["REQUEST_INFO", "REJECT"].includes(value.action) &&
      !value.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "此審核動作需要填寫原因。",
      });
    }
  });

export type MerchantApplicationFormInput = z.infer<
  typeof merchantApplicationFormSchema
>;
export type AdminMerchantApplicationReviewInput = z.infer<
  typeof adminMerchantApplicationReviewSchema
>;
