import { z } from "zod";

const issueInvoiceSchema = z
  .object({
    action: z.literal("ISSUE_INVOICE"),
    organizationId: z.uuid(),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    dueAt: z.iso.datetime({ offset: true }),
    description: z.string().trim().min(2).max(240),
    subtotalMinor: z.int().positive().max(100_000_000),
    taxMinor: z.int().min(0).max(100_000_000),
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, {
    path: ["periodEnd"],
    message: "帳務期間結束日不可早於開始日。",
  });

const confirmPaymentSchema = z
  .object({
    action: z.literal("CONFIRM_PAYMENT"),
    invoiceId: z.uuid(),
    amountMinor: z.int().positive().max(100_000_000),
    reference: z.string().trim().min(2).max(120),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const subscriptionStateSchema = z
  .object({
    action: z.enum(["SUSPEND", "REACTIVATE"]),
    organizationId: z.uuid(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const adminBillingActionSchema = z.union([
  issueInvoiceSchema,
  confirmPaymentSchema,
  subscriptionStateSchema,
]);

export type AdminBillingActionInput = z.infer<
  typeof adminBillingActionSchema
>;
