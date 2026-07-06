export const tenantStatuses = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const industryTypes = ["BEAUTY", "BODY_CARE", "EYELASH", "NAIL", "MASSAGE", "HAIR", "SPA", "OTHER"] as const;
export type IndustryType = (typeof industryTypes)[number];

export const featureKeys = [
  "CORE_APPOINTMENT",
  "CORE_CUSTOMER",
  "CORE_STAFF",
  "CORE_SERVICE",
  "MULTI_BRANCH",
  "PHOTO_RECORD",
  "CUSTOM_FORM",
  "CONSENT_FORM",
  "MEMBER_TAG",
  "PACKAGE",
  "COUPON",
  "STORED_VALUE",
  "LOYALTY_POINTS",
  "POS",
  "PRODUCT",
  "INVENTORY",
  "COMMISSION",
  "MARKETING",
  "LINE_INTEGRATION",
  "SMS",
  "PAYMENT_DEPOSIT",
  "ADVANCED_REPORT",
  "RESOURCE_MANAGEMENT"
] as const;
export type FeatureKey = (typeof featureKeys)[number];

export const permissionKeys = [
  "tenant.read",
  "tenant.update",
  "branch.read",
  "branch.create",
  "branch.update",
  "staff.read",
  "staff.create",
  "staff.update",
  "service.read",
  "service.create",
  "service.update",
  "appointment.read",
  "appointment.create",
  "appointment.update",
  "appointment.cancel",
  "customer.read",
  "customer.create",
  "customer.update",
  "report.tenant.read",
  "report.branch.read",
  "user.read",
  "user.invite",
  "user.update",
  "settings.read",
  "settings.update",
  "audit.read"
] as const;
export type PermissionKey = (typeof permissionKeys)[number];

export const appointmentStatuses = ["PENDING_CONFIRMATION", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export type PublicBookingAppointmentStatus = (typeof appointmentStatuses)[number];

export type TenantRole =
  | "TENANT_OWNER"
  | "TENANT_ADMIN"
  | "AREA_MANAGER"
  | "BRANCH_MANAGER"
  | "RECEPTIONIST"
  | "STAFF"
  | "ACCOUNTANT"
  | "MARKETING"
  | "VIEWER";

export type PlatformRole = "PLATFORM_SUPER_ADMIN" | "PLATFORM_SUPPORT" | "PLATFORM_FINANCE" | "PLATFORM_OPERATOR";

export type RequestContext = {
  userId: string;
  activeTenantId: string;
  activeBranchId?: string;
  membershipId: string;
  permissions: string[];
  allowedBranchIds: string[] | "*";
  requestId: string;
};

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  industryType: IndustryType;
  timezone: string;
};

export type PublicBookingTenant = {
  id: string;
  slug: string;
  name: string;
  industryType: IndustryType;
  timezone: string;
  bookingNotice: string;
};

export type PublicBookingBranch = {
  id: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
};

export type PublicBookingServiceItem = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
  description: string;
};

export type PublicBookingStaff = {
  id: string;
  name: string;
  title: string;
};

export type PublicBookingDate = {
  date: string;
  label: string;
  slots: string[];
};

export type PublicBookingOptions = {
  tenant: PublicBookingTenant;
  branches: PublicBookingBranch[];
  services: PublicBookingServiceItem[];
  staff: PublicBookingStaff[];
  availableDates: PublicBookingDate[];
};

export type PublicBooking = {
  id: string;
  tenantId: string;
  branch: PublicBookingBranch;
  service: PublicBookingServiceItem;
  staff: PublicBookingStaff;
  customer: {
    name: string;
    phone: string;
    email?: string;
    note?: string;
  };
  appointment: {
    date: string;
    time: string;
    durationMinutes: number;
    status: PublicBookingAppointmentStatus;
    statusNote?: string;
    updatedAt?: string;
  };
  createdAt: string;
};

export type ApiSuccess<TData, TMeta = Record<string, never>> = {
  success: true;
  data: TData;
  meta: TMeta;
  error: null;
  requestId: string;
};

export type ApiFailure = {
  success: false;
  data: null;
  meta: null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
};

export type ApiResponse<TData, TMeta = Record<string, never>> = ApiSuccess<TData, TMeta> | ApiFailure;

export function ok<TData, TMeta = Record<string, never>>(
  data: TData,
  meta = {} as TMeta,
  requestId = "not-bound"
): ApiSuccess<TData, TMeta> {
  return {
    success: true,
    data,
    meta,
    error: null,
    requestId
  };
}

export function fail(code: string, message: string, requestId = "not-bound", details?: Record<string, unknown>): ApiFailure {
  const error = details ? { code, message, details } : { code, message };

  return {
    success: false,
    data: null,
    meta: null,
    error,
    requestId
  };
}
