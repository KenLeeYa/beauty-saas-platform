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
  description: z.string().trim().max(1_000).default(""),
  durationMinutes: z.int().min(15).max(720),
  priceMinor: z.int().min(0).max(100_000_000),
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
}).strict();

export const merchantServiceToggleSchema = z.object({
  locationServiceId: z.uuid(),
  onlineBookingEnabled: z.boolean(),
}).strict();

export const merchantLocationStateSchema = z.object({
  bookingState: z.enum(["OPEN", "PAUSED", "CLOSED"]),
  onlineBookingEnabled: z.boolean(),
}).strict();

export const merchantDayClosureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closed: z.boolean(),
  reason: z.string().trim().min(1).max(240),
}).strict();
