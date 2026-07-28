import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const uuidSchema = z.uuid();
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const tokenSchema = z.string().min(32).max(256);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const publicLocationSchema = z.object({
  organizationSlug: slugSchema,
  locationSlug: slugSchema,
}).strict();

export const createPublicSessionSchema = publicLocationSchema.extend({
  turnstileToken: z.string().min(1).max(4_096),
  deviceId: z.string().trim().min(8).max(256),
});

export const publicAvailabilitySchema = z.object({
  serviceVariantId: uuidSchema,
  date: localDateSchema,
  staffProfileId: uuidSchema.optional(),
}).strict();

export const createBookingHoldSchema = z.object({
  serviceVariantId: uuidSchema,
  staffProfileId: uuidSchema,
  startsAt: isoDateTimeSchema,
}).strict();

export const confirmPublicBookingSchema = z.object({
  holdToken: tokenSchema,
  customer: z.object({
    displayName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(8).max(32),
    email: z.union([z.email(), z.literal("")]).optional(),
    note: z.string().trim().max(1_000).optional(),
  }).strict(),
  consents: z.object({
    service: z.literal(true),
    marketing: z.boolean().default(false),
  }).strict(),
}).strict();

export const trackingTokenSchema = z.object({
  trackingToken: tokenSchema,
}).strict();

export const cancelPublicBookingSchema = trackingTokenSchema.extend({
  reason: z.string().trim().min(1).max(500),
});

export const reschedulePublicBookingSchema = z.object({
  trackingToken: tokenSchema,
  holdToken: tokenSchema,
}).strict();

export type PublicLocationInput = z.infer<typeof publicLocationSchema>;
export type PublicAvailabilityInput = z.infer<
  typeof publicAvailabilitySchema
>;
export type ConfirmPublicBookingInput = z.infer<
  typeof confirmPublicBookingSchema
>;
