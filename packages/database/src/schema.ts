import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { featureKeys, industryTypes, permissionKeys, tenantStatuses } from "@beauty-saas/shared";

export const tenantStatusEnum = pgEnum("tenant_status", tenantStatuses);
export const industryTypeEnum = pgEnum("industry_type", industryTypes);
export const membershipStatusEnum = pgEnum("membership_status", ["INVITED", "ACTIVE", "DISABLED", "REMOVED"]);
export const platformUserStatusEnum = pgEnum("platform_user_status", ["ACTIVE", "DISABLED"]);
export const actorTypeEnum = pgEnum("audit_actor_type", ["USER", "PLATFORM_SUPPORT", "SYSTEM"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]);
export const jobStatusEnum = pgEnum("job_status", ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]);
export const featureKeyEnum = pgEnum("feature_key", featureKeys);
export const permissionKeyEnum = pgEnum("permission_key", permissionKeys);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    industryType: industryTypeEnum("industry_type").notNull(),
    status: tenantStatusEnum("status").notNull().default("TRIAL"),
    timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Taipei"),
    defaultLocale: varchar("default_locale", { length: 20 }).notNull().default("zh-TW"),
    subscriptionPlanId: uuid("subscription_plan_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true })
  },
  (table) => ({
    slugIdx: uniqueIndex("tenants_slug_uidx").on(table.slug),
    statusIdx: index("tenants_status_idx").on(table.status)
  })
);

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    key: varchar("key", { length: 120 }).notNull(),
    valueJson: jsonb("value_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantKeyIdx: uniqueIndex("tenant_settings_tenant_key_uidx").on(table.tenantId, table.key)
  })
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    address: text("address"),
    timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Taipei"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantCodeIdx: uniqueIndex("branches_tenant_code_uidx").on(table.tenantId, table.code),
    tenantActiveIdx: index("branches_tenant_active_idx").on(table.tenantId, table.isActive)
  })
);

export const branchSettings = pgTable(
  "branch_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    key: varchar("key", { length: 120 }).notNull(),
    valueJson: jsonb("value_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    branchKeyIdx: uniqueIndex("branch_settings_branch_key_uidx").on(table.branchId, table.key)
  })
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    googleSub: varchar("google_sub", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    avatarUrl: text("avatar_url"),
    platformStatus: platformUserStatusEnum("platform_status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_uidx").on(table.email),
    googleSubIdx: uniqueIndex("users_google_sub_uidx").on(table.googleSub)
  })
);

export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    provider: varchar("provider", { length: 60 }).notNull(),
    providerSubject: varchar("provider_subject", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerSubjectIdx: uniqueIndex("user_identities_provider_subject_uidx").on(table.provider, table.providerSubject)
  })
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    key: varchar("key", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantKeyIdx: uniqueIndex("roles_tenant_key_uidx").on(table.tenantId, table.key)
  })
);

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: permissionKeyEnum("key").notNull().unique(),
  description: text("description")
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id)
  },
  (table) => ({
    rolePermissionIdx: uniqueIndex("role_permissions_role_permission_uidx").on(table.roleId, table.permissionId)
  })
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    status: membershipStatusEnum("status").notNull().default("INVITED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
  },
  (table) => ({
    tenantUserIdx: uniqueIndex("tenant_memberships_tenant_user_uidx").on(table.tenantId, table.userId),
    tenantStatusIdx: index("tenant_memberships_tenant_status_idx").on(table.tenantId, table.status)
  })
);

export const branchMemberships = pgTable(
  "branch_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    tenantMembershipId: uuid("tenant_membership_id").notNull().references(() => tenantMemberships.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    membershipBranchIdx: uniqueIndex("branch_memberships_membership_branch_uidx").on(table.tenantMembershipId, table.branchId),
    tenantBranchIdx: index("branch_memberships_tenant_branch_idx").on(table.tenantId, table.branchId)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    activeTenantId: uuid("active_tenant_id").references(() => tenants.id),
    activeBranchId: uuid("active_branch_id").references(() => branches.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 80 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    userIdx: index("sessions_user_idx").on(table.userId)
  })
);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const features = pgTable("features", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: featureKeyEnum("key").notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  isDefaultEnabled: boolean("is_default_enabled").notNull().default(false)
});

export const planFeatures = pgTable(
  "plan_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id),
    featureId: uuid("feature_id").notNull().references(() => features.id),
    isEnabled: boolean("is_enabled").notNull().default(true)
  },
  (table) => ({
    planFeatureIdx: uniqueIndex("plan_features_plan_feature_uidx").on(table.planId, table.featureId)
  })
);

export const tenantFeatures = pgTable(
  "tenant_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    featureId: uuid("feature_id").notNull().references(() => features.id),
    isEnabled: boolean("is_enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantFeatureIdx: uniqueIndex("tenant_features_tenant_feature_uidx").on(table.tenantId, table.featureId)
  })
);

export const industryTemplates = pgTable("industry_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  industryType: industryTypeEnum("industry_type").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  defaultSettings: jsonb("default_settings").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 255 }),
    birthday: date("birthday"),
    gender: varchar("gender", { length: 40 }),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    source: varchar("source", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantPhoneIdx: index("customers_tenant_phone_idx").on(table.tenantId, table.phone)
  })
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    primaryStaffId: uuid("primary_staff_id"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").notNull().default("PENDING"),
    source: varchar("source", { length: 80 }).notNull().default("MANUAL"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancellationReason: text("cancellation_reason")
  },
  (table) => ({
    tenantBranchStartIdx: index("appointments_tenant_branch_start_idx").on(table.tenantId, table.branchId, table.startAt),
    tenantStaffRangeIdx: index("appointments_tenant_staff_range_idx").on(table.tenantId, table.primaryStaffId, table.startAt, table.endAt)
  })
);

export const appointmentServices = pgTable(
  "appointment_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id),
    serviceId: uuid("service_id").notNull(),
    staffId: uuid("staff_id"),
    durationMinutes: integer("duration_minutes").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantAppointmentIdx: index("appointment_services_tenant_appointment_idx").on(table.tenantId, table.appointmentId)
  })
);

export const storedObjects = pgTable(
  "stored_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    bucket: varchar("bucket", { length: 120 }).notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename"),
    mimeType: varchar("mime_type", { length: 160 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: varchar("checksum", { length: 255 }),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => ({
    tenantObjectIdx: index("stored_objects_tenant_object_idx").on(table.tenantId, table.objectKey)
  })
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    jobType: varchar("job_type", { length: 80 }).notNull(),
    payloadJson: jsonb("payload_json").notNull().default(sql`'{}'::jsonb`),
    status: jobStatusEnum("status").notNull().default("PENDING"),
    priority: integer("priority").notNull().default(100),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 120 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => ({
    runnableIdx: index("background_jobs_runnable_idx").on(table.status, table.runAt, table.priority),
    tenantIdx: index("background_jobs_tenant_idx").on(table.tenantId)
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }),
    oldData: jsonb("old_data"),
    newData: jsonb("new_data"),
    requestId: varchar("request_id", { length: 120 }).notNull(),
    ipAddress: varchar("ip_address", { length: 80 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantCreatedIdx: index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt)
  })
);
