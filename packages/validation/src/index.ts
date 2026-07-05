import { z } from "zod";
import { industryTypes, tenantStatuses } from "@beauty-saas/shared";

export const tenantSlugSchema = z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createTenantSchema = z.object({
  name: z.string().min(1).max(160),
  slug: tenantSlugSchema,
  industryType: z.enum(industryTypes),
  timezone: z.string().default("Asia/Taipei"),
  defaultLocale: z.string().default("zh-TW")
});

export const tenantStatusSchema = z.enum(tenantStatuses);

export const createBranchSchema = z.object({
  name: z.string().min(1).max(160),
  code: z.string().min(1).max(40),
  phone: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  timezone: z.string().default("Asia/Taipei")
});

export const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  primaryStaffId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  serviceIds: z.array(z.string().uuid()).min(1),
  notes: z.string().max(2000).optional()
});

export const createPublicBookingSchema = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  date: z.string().date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  customerName: z.string().min(1).max(80),
  customerPhone: z.string().min(6).max(40),
  customerEmail: z.string().email().optional().or(z.literal("")),
  note: z.string().max(500).optional()
});

export const createCustomerSchema = z.object({
  displayName: z.string().min(1).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  birthday: z.string().date().optional(),
  gender: z.string().max(40).optional()
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type CreatePublicBookingInput = z.infer<typeof createPublicBookingSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
