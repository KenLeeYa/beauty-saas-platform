import "server-only";

import { Prisma, type resource_kind } from "@prisma/client";

import {
  assertCapability,
  type OrganizationContext,
  requireLocation,
} from "../authorization/context";
import { prisma } from "../database/prisma";
import { requireEntitlement } from "../entitlements/service";
import { AppError } from "../http/errors";
import {
  formatDateInTimeZone,
} from "../time/timezone";

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("886")) {
    return `+${digits}`;
  }
  if (digits.startsWith("09") && digits.length === 10) {
    return `+886${digits.slice(1)}`;
  }
  return value.startsWith("+") ? `+${digits}` : digits;
}

async function audit(
  transaction: Prisma.TransactionClient,
  input: {
    context: OrganizationContext;
    action: string;
    targetType: string;
    targetId: string;
    requestId: string;
    after: Prisma.InputJsonValue;
  },
): Promise<void> {
  await transaction.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: input.context.location?.id,
      actor_profile_id: input.context.session.profileId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: input.after,
    },
  });
}

export async function createMerchantService(input: {
  context: OrganizationContext;
  name: string;
  variantName: string;
  categoryName: string;
  description: string;
  durationMinutes: number;
  priceMinor: number;
  requestId: string;
}): Promise<{
  serviceId: string;
  locationServiceId: string;
}> {
  assertCapability(input.context, "catalog.manage");
  const location = requireLocation(input.context);

  return prisma.$transaction(
    async (transaction) => {
      const duplicate = await transaction.services.findFirst({
        where: {
          organization_id: input.context.organization.id,
          name: input.name,
        },
        select: {
          id: true,
        },
      });
      if (duplicate) {
        throw new AppError(
          "CONFLICT",
          "已有相同名稱的服務。",
          409,
        );
      }

      let categoryId: string | null = null;
      if (input.categoryName) {
        const existingCategory =
          await transaction.service_categories.findFirst({
            where: {
              organization_id: input.context.organization.id,
              name: input.categoryName,
            },
            select: {
              id: true,
            },
          });
        const category =
          existingCategory ??
          (await transaction.service_categories.create({
            data: {
              organization_id: input.context.organization.id,
              name: input.categoryName,
              is_active: true,
            },
            select: {
              id: true,
            },
          }));
        categoryId = category.id;
      }

      const service = await transaction.services.create({
        data: {
          organization_id: input.context.organization.id,
          category_id: categoryId,
          name: input.name,
          description: input.description,
          online_booking_enabled: true,
          is_active: true,
          sort_order: Date.now() % 1_000_000,
        },
        select: {
          id: true,
        },
      });
      const variant = await transaction.service_variants.create({
        data: {
          organization_id: input.context.organization.id,
          service_id: service.id,
          name: input.variantName,
          duration_minutes: input.durationMinutes,
          price_minor: input.priceMinor,
          is_default: true,
          is_active: true,
        },
        select: {
          id: true,
        },
      });
      const locationService =
        await transaction.location_services.create({
          data: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            service_id: service.id,
            service_variant_id: variant.id,
            online_booking_enabled: true,
            is_active: true,
            sort_order: Date.now() % 1_000_000,
          },
          select: {
            id: true,
          },
        });

      const staff = await transaction.staff_profiles.findMany({
        where: {
          organization_id: input.context.organization.id,
          is_active: true,
          staff_location_assignments: {
            some: {
              location_id: location.id,
              is_active: true,
            },
          },
        },
        select: {
          id: true,
        },
      });
      if (staff.length > 0) {
        await transaction.staff_service_assignments.createMany({
          data: staff.map(({ id }) => ({
            organization_id: input.context.organization.id,
            staff_profile_id: id,
            service_variant_id: variant.id,
            is_active: true,
          })),
          skipDuplicates: true,
        });
        await transaction.service_staff_assignments.createMany({
          data: staff.map(({ id }) => ({
            organization_id: input.context.organization.id,
            location_service_id: locationService.id,
            staff_profile_id: id,
            online_booking_enabled: true,
            is_active: true,
          })),
          skipDuplicates: true,
        });
      }

      await audit(transaction, {
        context: input.context,
        action: "SERVICE_CREATE",
        targetType: "SERVICE",
        targetId: service.id,
        requestId: input.requestId,
        after: {
          name: input.name,
          variantName: input.variantName,
          categoryName: input.categoryName,
          durationMinutes: input.durationMinutes,
          priceMinor: input.priceMinor,
        },
      });
      await transaction.merchant_setup_progress.updateMany({
        where: {
          organization_id: input.context.organization.id,
          service_completed_at: null,
        },
        data: {
          service_completed_at: new Date(),
          last_step: "STAFF",
        },
      });
      return {
        serviceId: service.id,
        locationServiceId: locationService.id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

export async function setMerchantServiceOnline(input: {
  context: OrganizationContext;
  locationServiceId: string;
  onlineBookingEnabled: boolean;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "catalog.manage");
  const location = requireLocation(input.context);
  const updated = await prisma.location_services.updateMany({
    where: {
      id: input.locationServiceId,
      organization_id: input.context.organization.id,
      location_id: location.id,
    },
    data: {
      online_booking_enabled: input.onlineBookingEnabled,
    },
  });
  if (updated.count !== 1) {
    throw new AppError("NOT_FOUND", "找不到服務。", 404);
  }
  await prisma.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: location.id,
      actor_profile_id: input.context.session.profileId,
      action: "SERVICE_ONLINE_TOGGLE",
      target_type: "LOCATION_SERVICE",
      target_id: input.locationServiceId,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: {
        onlineBookingEnabled: input.onlineBookingEnabled,
      },
    },
  });
  return { success: true };
}

export async function createMerchantStaff(input: {
  context: OrganizationContext;
  displayName: string;
  title: string;
  skills: string[];
  requestId: string;
}): Promise<{ id: string }> {
  assertCapability(input.context, "staff.manage");
  await requireEntitlement(
    input.context.organization.id,
    "STAFF_SCHEDULING",
  );
  const location = requireLocation(input.context);

  return prisma.$transaction(
    async (transaction) => {
      const staff = await transaction.staff_profiles.create({
        data: {
          organization_id: input.context.organization.id,
          display_name: input.displayName,
          title: input.title,
          skills: input.skills,
          public_visible: true,
          is_active: true,
          sort_order: Date.now() % 1_000_000,
        },
        select: {
          id: true,
        },
      });
      await transaction.staff_location_assignments.create({
        data: {
          organization_id: input.context.organization.id,
          staff_profile_id: staff.id,
          location_id: location.id,
          is_primary: true,
          is_active: true,
        },
      });

      const businessHours =
        await transaction.location_business_hours.findMany({
          where: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            is_closed: false,
          },
          select: {
            day_of_week: true,
            segment_index: true,
            opens_at: true,
            closes_at: true,
          },
        });
      const effectiveFrom = new Date(
        `${formatDateInTimeZone(new Date(), location.timezone)}T00:00:00.000Z`,
      );
      if (businessHours.length > 0) {
        await transaction.staff_availability_rules.createMany({
          data: businessHours.map((hours) => ({
            organization_id: input.context.organization.id,
            location_id: location.id,
            staff_profile_id: staff.id,
            day_of_week: hours.day_of_week,
            segment_index: hours.segment_index,
            starts_at: hours.opens_at,
            ends_at: hours.closes_at,
            effective_from: effectiveFrom,
            is_active: true,
          })),
        });
      }

      const locationServices =
        await transaction.location_services.findMany({
          where: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            is_active: true,
          },
          select: {
            id: true,
            service_variant_id: true,
          },
        });
      if (locationServices.length > 0) {
        await transaction.staff_service_assignments.createMany({
          data: locationServices.map((service) => ({
            organization_id: input.context.organization.id,
            staff_profile_id: staff.id,
            service_variant_id: service.service_variant_id,
            is_active: true,
          })),
          skipDuplicates: true,
        });
        await transaction.service_staff_assignments.createMany({
          data: locationServices.map((service) => ({
            organization_id: input.context.organization.id,
            location_service_id: service.id,
            staff_profile_id: staff.id,
            online_booking_enabled: true,
            is_active: true,
          })),
          skipDuplicates: true,
        });
      }
      await audit(transaction, {
        context: input.context,
        action: "STAFF_CREATE",
        targetType: "STAFF_PROFILE",
        targetId: staff.id,
        requestId: input.requestId,
        after: {
          displayName: input.displayName,
          title: input.title,
          skills: input.skills,
        },
      });
      await transaction.merchant_setup_progress.updateMany({
        where: {
          organization_id: input.context.organization.id,
          staff_completed_at: null,
        },
        data: {
          staff_completed_at: new Date(),
          last_step: "RESOURCE",
        },
      });
      return staff;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

export async function createMerchantResource(input: {
  context: OrganizationContext;
  name: string;
  typeName: string;
  kind: resource_kind;
  requestId: string;
}): Promise<{ id: string }> {
  assertCapability(input.context, "resource.manage");
  await requireEntitlement(
    input.context.organization.id,
    "RESOURCE_MANAGEMENT",
  );
  const location = requireLocation(input.context);

  return prisma.$transaction(
    async (transaction) => {
      let type = await transaction.resource_types.findFirst({
        where: {
          organization_id: input.context.organization.id,
          name: input.typeName,
        },
        select: {
          id: true,
        },
      });
      type ??= await transaction.resource_types.create({
        data: {
          organization_id: input.context.organization.id,
          name: input.typeName,
          kind: input.kind,
          is_active: true,
        },
        select: {
          id: true,
        },
      });

      const resource = await transaction.resources.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          resource_type_id: type.id,
          name: input.name,
          is_active: true,
          sort_order: Date.now() % 1_000_000,
        },
        select: {
          id: true,
        },
      });
      const businessHours =
        await transaction.location_business_hours.findMany({
          where: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            is_closed: false,
          },
          select: {
            day_of_week: true,
            segment_index: true,
            opens_at: true,
            closes_at: true,
          },
        });
      if (businessHours.length > 0) {
        await transaction.resource_availability_rules.createMany({
          data: businessHours.map((hours) => ({
            organization_id: input.context.organization.id,
            resource_id: resource.id,
            day_of_week: hours.day_of_week,
            segment_index: hours.segment_index,
            starts_at: hours.opens_at,
            ends_at: hours.closes_at,
            is_active: true,
          })),
        });
      }
      await audit(transaction, {
        context: input.context,
        action: "RESOURCE_CREATE",
        targetType: "RESOURCE",
        targetId: resource.id,
        requestId: input.requestId,
        after: {
          name: input.name,
          typeName: input.typeName,
          kind: input.kind,
        },
      });
      await transaction.merchant_setup_progress.updateMany({
        where: {
          organization_id: input.context.organization.id,
          resource_completed_at: null,
        },
        data: {
          resource_completed_at: new Date(),
          last_step: "POLICIES",
        },
      });
      return resource;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

export async function createMerchantCustomer(input: {
  context: OrganizationContext;
  displayName: string;
  phone: string;
  email?: string;
  birthday?: string;
  requestId: string;
}): Promise<{ id: string }> {
  assertCapability(input.context, "customer.manage");
  await requireEntitlement(
    input.context.organization.id,
    "CUSTOMER_CRM",
  );
  const normalizedPhone = normalizePhone(input.phone);
  const normalizedEmail = input.email?.trim().toLowerCase() || null;

  return prisma.$transaction(
    async (transaction) => {
      const duplicate = await transaction.customer_contacts.findFirst({
        where: {
          organization_id: input.context.organization.id,
          OR: [
            {
              contact_type: "PHONE",
              normalized_value: normalizedPhone,
            },
            ...(normalizedEmail
              ? [
                  {
                    contact_type: "EMAIL" as const,
                    normalized_value: normalizedEmail,
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
        },
      });
      if (duplicate) {
        throw new AppError(
          "CONFLICT",
          "已有相同聯絡方式的顧客。",
          409,
        );
      }

      const customer = await transaction.customers.create({
        data: {
          organization_id: input.context.organization.id,
          display_name: input.displayName,
          birthday: input.birthday
            ? new Date(`${input.birthday}T00:00:00.000Z`)
            : null,
          source: "OTHER",
          customer_contacts: {
            create: [
              {
                contact_type: "PHONE",
                value: input.phone,
                normalized_value: normalizedPhone,
                is_primary: true,
              },
              ...(normalizedEmail
                ? [
                    {
                      contact_type: "EMAIL" as const,
                      value: normalizedEmail,
                      normalized_value: normalizedEmail,
                    },
                  ]
                : []),
            ],
          },
        },
        select: {
          id: true,
        },
      });
      await audit(transaction, {
        context: input.context,
        action: "CUSTOMER_CREATE",
        targetType: "CUSTOMER",
        targetId: customer.id,
        requestId: input.requestId,
        after: {
          displayName: input.displayName,
          hasPhone: true,
          hasEmail: Boolean(normalizedEmail),
          birthday: input.birthday || null,
        },
      });
      return customer;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

export async function updateMerchantLocationState(input: {
  context: OrganizationContext;
  bookingState: "OPEN" | "PAUSED" | "CLOSED";
  onlineBookingEnabled: boolean;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "location.manage");
  const location = requireLocation(input.context);
  await prisma.locations.update({
    where: {
      id: location.id,
    },
    data: {
      booking_state: input.bookingState,
      online_booking_enabled: input.onlineBookingEnabled,
    },
  });
  await prisma.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: location.id,
      actor_profile_id: input.context.session.profileId,
      action: "LOCATION_BOOKING_STATE_UPDATE",
      target_type: "LOCATION",
      target_id: location.id,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: {
        bookingState: input.bookingState,
        onlineBookingEnabled: input.onlineBookingEnabled,
      },
    },
  });
  return { success: true };
}

export async function updateMerchantLocationProfile(input: {
  context: OrganizationContext;
  name: string;
  description: string;
  address: string;
  phone: string;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "location.manage");
  const location = requireLocation(input.context);
  const result = await prisma.locations.updateMany({
    where: {
      id: location.id,
      organization_id: input.context.organization.id,
    },
    data: {
      name: input.name,
      description: input.description,
      address: input.address,
      phone: input.phone,
    },
  });
  if (result.count !== 1) {
    throw new AppError("NOT_FOUND", "找不到分店。", 404);
  }
  await prisma.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: location.id,
      actor_profile_id: input.context.session.profileId,
      action: "LOCATION_PROFILE_UPDATE",
      target_type: "LOCATION",
      target_id: location.id,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: {
        name: input.name,
        description: input.description,
        address: input.address,
        phone: input.phone,
      },
    },
  });
  return { success: true };
}

export async function updateMerchantOrganizationProfile(input: {
  context: OrganizationContext;
  name: string;
  businessName: string;
  entityType: "SOLE_PROPRIETOR" | "COMPANY";
  email: string;
  phone: string;
  brandDescription: string;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "organization.manage");
  const result = await prisma.organizations.updateMany({
    where: {
      id: input.context.organization.id,
    },
    data: {
      name: input.name,
      business_name: input.businessName,
      entity_type: input.entityType,
      email: input.email,
      phone: input.phone,
      brand_description: input.brandDescription,
    },
  });
  if (result.count !== 1) {
    throw new AppError("NOT_FOUND", "找不到品牌資料。", 404);
  }
  await prisma.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: input.context.location?.id,
      actor_profile_id: input.context.session.profileId,
      action: "ORGANIZATION_PROFILE_UPDATE",
      target_type: "ORGANIZATION",
      target_id: input.context.organization.id,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: {
        name: input.name,
        businessName: input.businessName,
        entityType: input.entityType,
        email: input.email,
        phone: input.phone,
        brandDescription: input.brandDescription,
      },
    },
  });
  return { success: true };
}

export async function updateMerchantBookingSettings(input: {
  context: OrganizationContext;
  onlineBookingEnabled: boolean;
  depositsEnabled: boolean;
  depositMode: "FIXED" | "PERCENTAGE";
  depositAmountMinor: number;
  depositPercentage: number;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "location.manage");
  const location = requireLocation(input.context);
  if (input.onlineBookingEnabled) {
    await requireEntitlement(
      input.context.organization.id,
      "ONLINE_BOOKING",
    );
  }
  if (input.depositsEnabled) {
    await requireEntitlement(input.context.organization.id, "DEPOSITS");
  }

  await prisma.$transaction(
    async (transaction) => {
      await transaction.location_booking_policies.upsert({
        where: {
          location_id: location.id,
        },
        create: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          deposits_enabled: input.depositsEnabled,
        },
        update: {
          deposits_enabled: input.depositsEnabled,
        },
      });

      const deposit = await transaction.deposit_policies.findFirst({
        where: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          service_variant_id: null,
        },
        select: {
          id: true,
        },
      });
      const depositData = {
        mode: input.depositMode,
        fixed_amount_minor:
          input.depositMode === "FIXED"
            ? input.depositAmountMinor
            : null,
        percentage:
          input.depositMode === "PERCENTAGE"
            ? new Prisma.Decimal(input.depositPercentage)
            : null,
        is_active: true,
      } as const;
      if (deposit) {
        await transaction.deposit_policies.update({
          where: {
            id: deposit.id,
          },
          data: depositData,
        });
      } else {
        await transaction.deposit_policies.create({
          data: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            name: "分店預設訂金",
            ...depositData,
          },
        });
      }

      await transaction.locations.update({
        where: {
          id: location.id,
        },
        data: {
          online_booking_enabled: input.onlineBookingEnabled,
          booking_state: input.onlineBookingEnabled ? "OPEN" : "PAUSED",
        },
      });
      await audit(transaction, {
        context: input.context,
        action: "BOOKING_SETTINGS_UPDATE",
        targetType: "LOCATION",
        targetId: location.id,
        requestId: input.requestId,
        after: {
          onlineBookingEnabled: input.onlineBookingEnabled,
          depositsEnabled: input.depositsEnabled,
          depositMode: input.depositMode,
          depositAmountMinor: input.depositAmountMinor,
          depositPercentage: input.depositPercentage,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
  return { success: true };
}

export async function updateMerchantCustomer(input: {
  context: OrganizationContext;
  customerId: string;
  birthday?: string;
  depositMode?: "DEFAULT" | "REQUIRED" | "EXEMPT";
  isBlacklisted?: boolean;
  blacklistReason?: string;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "customer.manage");
  await requireEntitlement(
    input.context.organization.id,
    "CUSTOMER_CRM",
  );
  if (input.depositMode && input.depositMode !== "DEFAULT") {
    await requireEntitlement(input.context.organization.id, "DEPOSITS");
  }
  if (input.isBlacklisted !== undefined) {
    await requireEntitlement(
      input.context.organization.id,
      "CUSTOMER_BLACKLIST",
    );
  }

  const result = await prisma.customers.updateMany({
    where: {
      id: input.customerId,
      organization_id: input.context.organization.id,
      is_active: true,
    },
    data: {
      ...(input.birthday !== undefined
        ? {
            birthday: input.birthday
              ? new Date(`${input.birthday}T00:00:00.000Z`)
              : null,
          }
        : {}),
      ...(input.depositMode
        ? { deposit_mode: input.depositMode }
        : {}),
      ...(input.isBlacklisted !== undefined
        ? {
            is_blacklisted: input.isBlacklisted,
            blacklist_reason: input.isBlacklisted
              ? input.blacklistReason ?? null
              : null,
            blacklisted_at: input.isBlacklisted ? new Date() : null,
          }
        : {}),
    },
  });
  if (result.count !== 1) {
    throw new AppError("NOT_FOUND", "找不到顧客。", 404);
  }
  await prisma.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: input.context.location?.id,
      actor_profile_id: input.context.session.profileId,
      action: "CUSTOMER_PROFILE_UPDATE",
      target_type: "CUSTOMER",
      target_id: input.customerId,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: {
        ...(input.birthday !== undefined
          ? { birthday: input.birthday || null }
          : {}),
        ...(input.depositMode
          ? { depositMode: input.depositMode }
          : {}),
        ...(input.isBlacklisted !== undefined
          ? {
              isBlacklisted: input.isBlacklisted,
              blacklistReason: input.isBlacklisted
                ? input.blacklistReason ?? null
                : null,
            }
          : {}),
      },
    },
  });
  return { success: true };
}

export async function setMerchantDaySchedule(input: {
  context: OrganizationContext;
  date: string;
  mode: "NORMAL" | "CUSTOM" | "CLOSED";
  reason: string;
  segments: Array<{
    startsAt: string;
    endsAt: string;
  }>;
  requestId: string;
}): Promise<{ success: true }> {
  assertCapability(input.context, "location.manage");
  await requireEntitlement(
    input.context.organization.id,
    "BUSINESS_HOURS",
  );
  const location = requireLocation(input.context);
  const dateValue = new Date(`${input.date}T00:00:00.000Z`);
  const marker = `LOCATION_SCHEDULE:${input.date}:`;

  await prisma.$transaction(
    async (transaction) => {
      await transaction.location_day_schedules.deleteMany({
        where: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          schedule_date: dateValue,
        },
      });
      await transaction.staff_schedule_exceptions.deleteMany({
        where: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          exception_date: dateValue,
          OR: [
            { reason: { startsWith: marker } },
            {
              reason: {
                startsWith: `LOCATION_CLOSED:${input.date}:`,
              },
            },
          ],
        },
      });

      if (input.mode === "CLOSED") {
        await transaction.location_day_schedules.create({
          data: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            schedule_date: dateValue,
            is_closed: true,
            reason: input.reason,
          },
        });
      }

      if (input.mode === "CUSTOM") {
        for (const [index, segment] of input.segments.entries()) {
          await transaction.$executeRaw(
            Prisma.sql`
              insert into public.location_day_schedules (
                organization_id,
                location_id,
                schedule_date,
                segment_index,
                opens_at,
                closes_at,
                is_closed,
                reason
              ) values (
                ${input.context.organization.id}::uuid,
                ${location.id}::uuid,
                ${input.date}::date,
                ${index},
                ${segment.startsAt}::time,
                ${segment.endsAt}::time,
                false,
                ${input.reason}
              )
            `,
          );
          await transaction.$executeRaw(
            Prisma.sql`
              insert into public.staff_schedule_exceptions (
                organization_id,
                location_id,
                staff_profile_id,
                exception_date,
                kind,
                starts_at,
                ends_at,
                reason
              )
              select
                ${input.context.organization.id}::uuid,
                ${location.id}::uuid,
                staff.id,
                ${input.date}::date,
                'AVAILABLE'::public.schedule_exception_kind,
                ${segment.startsAt}::time,
                ${segment.endsAt}::time,
                ${`${marker}${input.reason}`}
              from public.staff_profiles staff
              where staff.organization_id = ${input.context.organization.id}::uuid
                and staff.is_active
                and exists (
                  select 1
                  from public.staff_location_assignments assignment
                  where assignment.organization_id = ${input.context.organization.id}::uuid
                    and assignment.location_id = ${location.id}::uuid
                    and assignment.staff_profile_id = staff.id
                    and assignment.is_active
                )
            `,
          );
        }
      }
      await audit(transaction, {
        context: input.context,
        action: "LOCATION_DAY_SCHEDULE_UPDATE",
        targetType: "LOCATION",
        targetId: location.id,
        requestId: input.requestId,
        after: {
          date: input.date,
          mode: input.mode,
          reason: input.reason,
          segments: input.segments,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
  return { success: true };
}
