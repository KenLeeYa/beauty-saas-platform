import { z } from "zod";

const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "標籤顏色必須是六位十六進位色碼。");

export const customerTagCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      name: z.string().trim().min(1).max(40),
      color: tagColorSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("ASSIGN"),
      customerId: z.uuid(),
      tagId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("UNASSIGN"),
      customerId: z.uuid(),
      tagId: z.uuid(),
    })
    .strict(),
]);

export const createCustomerNoteSchema = z
  .object({
    customerId: z.uuid(),
    note: z.string().trim().min(1).max(2_000),
    sensitivity: z.enum(["STANDARD", "SENSITIVE"]),
  })
  .strict();
