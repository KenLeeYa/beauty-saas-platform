import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  assertCapability,
  requireLocation,
  type OrganizationContext,
} from "../authorization/context";
import { confirmMerchantPayment, updateMerchantBookingStatus } from "../merchant/bookings";
import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import { confirmPublicBooking } from "../public-booking/booking";
import type { PublicSessionContext } from "../public-booking/context";
import { createBookingHold } from "../public-booking/hold";
import { getPublicAvailability } from "../public-booking/availability";
import { randomToken, sha256 } from "../security/crypto";
import { requireEntitlement } from "../entitlements/service";
import {
  addLocalDays,
  formatDateInTimeZone,
} from "../time/timezone";
import type { MerchantSetupActionInput } from "./schemas";

type SetupProgressResult = {
  completedSteps: number;
  totalSteps: number;
  testBookingCompleted: boolean;
  goLiveAt: string | null;
};

const setupFields = [
  "brand_completed_at",
  "location_completed_at",
  "business_hours_completed_at",
  "service_completed_at",
  "staff_completed_at",
  "resource_completed_at",
  "policies_completed_at",
  "notifications_completed_at",
  "test_booking_completed_at",
] as const;

async function setupProgress(
  organizationId: string,
): Promise<SetupProgressResult> {
  const setup = await prisma.merchant_setup_progress.findUnique({
    where: {
      organization_id: organizationId,
    },
    select: {
      brand_completed_at: true,
      location_completed_at: true,
      business_hours_completed_at: true,
      service_completed_at: true,
      staff_completed_at: true,
      resource_completed_at: true,
      policies_completed_at: true,
      notifications_completed_at: true,
      test_booking_completed_at: true,
      go_live_at: true,
    },
  });
  if (!setup) {
    throw new AppError(
      "CONFLICT",
      "找不到商家開店設定進度。",
      409,
    );
  }
  const values = setupFields.map((field) => setup[field]);
  return {
    completedSteps: values.filter(Boolean).length,
    totalSteps: values.length,
    testBookingCompleted: Boolean(setup.test_booking_completed_at),
    goLiveAt: setup.go_live_at?.toISOString() ?? null,
  };
}

async function configureBusinessHours(input: {
  context: OrganizationContext;
  payload: Extract<
    MerchantSetupActionInput,
    { action: "BUSINESS_HOURS" }
  >;
  requestId: string;
}): Promise<void> {
  assertCapability(input.context, "location.manage");
  await requireEntitlement(
    input.context.organization.id,
    "BUSINESS_HOURS",
  );
  const location = requireLocation(input.context);
  const now = new Date();

  await prisma.$transaction(
    async (transaction) => {
      await transaction.location_business_hours.deleteMany({
        where: {
          organization_id: input.context.organization.id,
          location_id: location.id,
        },
      });
      for (const day of input.payload.days) {
        await transaction.$executeRaw(
          Prisma.sql`
            insert into public.location_business_hours (
              organization_id,
              location_id,
              day_of_week,
              segment_index,
              opens_at,
              closes_at,
              is_closed
            )
            values (
              ${input.context.organization.id}::uuid,
              ${location.id}::uuid,
              ${day},
              0,
              ${input.payload.opensAt}::time,
              ${input.payload.closesAt}::time,
              false
            )
          `,
        );
      }
      await transaction.merchant_setup_progress.update({
        where: {
          organization_id: input.context.organization.id,
        },
        data: {
          business_hours_completed_at: now,
          last_step: "SERVICE",
        },
      });
      await transaction.audit_logs.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          actor_profile_id: input.context.session.profileId,
          action: "MERCHANT_SETUP_BUSINESS_HOURS",
          target_type: "LOCATION",
          target_id: location.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            days: input.payload.days,
            opensAt: input.payload.opensAt,
            closesAt: input.payload.closesAt,
          },
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

async function configurePolicies(input: {
  context: OrganizationContext;
  payload: Extract<MerchantSetupActionInput, { action: "POLICIES" }>;
  requestId: string;
}): Promise<void> {
  assertCapability(input.context, "location.manage");
  await Promise.all([
    requireEntitlement(input.context.organization.id, "DEPOSITS"),
    requireEntitlement(
      input.context.organization.id,
      "CANCELLATION_RULES",
    ),
  ]);
  const location = requireLocation(input.context);
  const now = new Date();

  await prisma.$transaction(
    async (transaction) => {
      await transaction.location_booking_policies.upsert({
        where: {
          location_id: location.id,
        },
        create: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          slot_interval_minutes: input.payload.slotIntervalMinutes,
          minimum_lead_minutes: input.payload.minimumLeadMinutes,
          maximum_advance_days: input.payload.maximumAdvanceDays,
          hold_minutes: input.payload.holdMinutes,
          deposits_enabled: input.payload.depositMode !== "NONE",
          cancellation_cutoff_hours:
            input.payload.cancellationCutoffHours,
          reminder_hours: [24, 3, 1],
        },
        update: {
          slot_interval_minutes: input.payload.slotIntervalMinutes,
          minimum_lead_minutes: input.payload.minimumLeadMinutes,
          maximum_advance_days: input.payload.maximumAdvanceDays,
          hold_minutes: input.payload.holdMinutes,
          deposits_enabled: input.payload.depositMode !== "NONE",
          cancellation_cutoff_hours:
            input.payload.cancellationCutoffHours,
          reminder_hours: [24, 3, 1],
        },
      });

      const deposit = await transaction.deposit_policies.findFirst({
        where: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          service_variant_id: null,
        },
        orderBy: {
          created_at: "asc",
        },
        select: {
          id: true,
        },
      });
      const depositData = {
        name: "公開預約訂金",
        mode: input.payload.depositMode,
        fixed_amount_minor:
          input.payload.depositMode === "FIXED"
            ? input.payload.depositAmountMinor
            : null,
        percentage:
          input.payload.depositMode === "PERCENTAGE"
            ? input.payload.depositPercentage
            : null,
        payment_window_minutes: 15,
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
            ...depositData,
          },
        });
      }

      const cancellation =
        await transaction.cancellation_policies.findFirst({
          where: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            service_variant_id: null,
          },
          orderBy: {
            created_at: "asc",
          },
          select: {
            id: true,
          },
        });
      const cancellationData = {
        name: "一般取消規則",
        free_cancellation_hours:
          input.payload.cancellationCutoffHours,
        late_fee_mode: "DEPOSIT_FORFEIT" as const,
        late_fee_fixed_minor: null,
        late_fee_percentage: null,
        no_show_fee_mode: "DEPOSIT_FORFEIT" as const,
        no_show_fee_fixed_minor: null,
        no_show_fee_percentage: null,
        is_active: true,
      };
      if (cancellation) {
        await transaction.cancellation_policies.update({
          where: {
            id: cancellation.id,
          },
          data: cancellationData,
        });
      } else {
        await transaction.cancellation_policies.create({
          data: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            ...cancellationData,
          },
        });
      }

      await transaction.merchant_setup_progress.update({
        where: {
          organization_id: input.context.organization.id,
        },
        data: {
          policies_completed_at: now,
          last_step: "NOTIFICATIONS",
        },
      });
      await transaction.audit_logs.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          actor_profile_id: input.context.session.profileId,
          action: "MERCHANT_SETUP_POLICIES",
          target_type: "LOCATION",
          target_id: location.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            slotIntervalMinutes: input.payload.slotIntervalMinutes,
            minimumLeadMinutes: input.payload.minimumLeadMinutes,
            maximumAdvanceDays: input.payload.maximumAdvanceDays,
            holdMinutes: input.payload.holdMinutes,
            cancellationCutoffHours:
              input.payload.cancellationCutoffHours,
            depositMode: input.payload.depositMode,
          },
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

async function configureNotifications(input: {
  context: OrganizationContext;
  payload: Extract<
    MerchantSetupActionInput,
    { action: "NOTIFICATIONS" }
  >;
  requestId: string;
}): Promise<void> {
  assertCapability(input.context, "organization.manage");
  const location = requireLocation(input.context);
  const channels = [...new Set(input.payload.channels)];
  const now = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.notification_integrations.createMany({
      data: channels.map((channel) => ({
        organization_id: input.context.organization.id,
        channel,
        status: "DISABLED" as const,
        configuration: {
          acknowledgedDuringSetup: true,
        },
      })),
      skipDuplicates: true,
    });
    await transaction.merchant_setup_progress.update({
      where: {
        organization_id: input.context.organization.id,
      },
      data: {
        notifications_completed_at: now,
        last_step: "TEST_BOOKING",
      },
    });
    await transaction.audit_logs.create({
      data: {
        organization_id: input.context.organization.id,
        location_id: location.id,
        actor_profile_id: input.context.session.profileId,
        action: "MERCHANT_SETUP_NOTIFICATIONS",
        target_type: "ORGANIZATION",
        target_id: input.context.organization.id,
        outcome: "SUCCESS",
        request_id: input.requestId,
        after_json: {
          channels,
          providerState: "DISABLED_UNTIL_CONFIGURED",
        },
      },
    });
  });
}

async function requireBaseSetup(
  context: OrganizationContext,
): Promise<void> {
  const setup = await prisma.merchant_setup_progress.findUnique({
    where: {
      organization_id: context.organization.id,
    },
    select: {
      brand_completed_at: true,
      location_completed_at: true,
      business_hours_completed_at: true,
      service_completed_at: true,
      staff_completed_at: true,
      resource_completed_at: true,
      policies_completed_at: true,
      notifications_completed_at: true,
    },
  });
  if (
    !setup ||
    [
      setup.brand_completed_at,
      setup.location_completed_at,
      setup.business_hours_completed_at,
      setup.service_completed_at,
      setup.staff_completed_at,
      setup.resource_completed_at,
      setup.policies_completed_at,
      setup.notifications_completed_at,
    ].some((value) => !value)
  ) {
    throw new AppError(
      "CONFLICT",
      "請先完成前八項開店設定。",
      409,
    );
  }
}

async function createTestBooking(input: {
  context: OrganizationContext;
  requestId: string;
}): Promise<void> {
  assertCapability(input.context, "booking.create");
  await requireBaseSetup(input.context);
  const location = requireLocation(input.context);
  const selection = await prisma.location_services.findFirst({
    where: {
      organization_id: input.context.organization.id,
      location_id: location.id,
      is_active: true,
      online_booking_enabled: true,
      service_variants: {
        is_active: true,
      },
      service_staff_assignments: {
        some: {
          is_active: true,
          online_booking_enabled: true,
          staff_profiles: {
            is_active: true,
          },
        },
      },
    },
    orderBy: {
      sort_order: "asc",
    },
    select: {
      service_variant_id: true,
      service_staff_assignments: {
        where: {
          is_active: true,
          online_booking_enabled: true,
          staff_profiles: {
            is_active: true,
          },
        },
        orderBy: {
          created_at: "asc",
        },
        take: 1,
        select: {
          staff_profile_id: true,
        },
      },
    },
  });
  const staffProfileId =
    selection?.service_staff_assignments[0]?.staff_profile_id;
  if (!selection || !staffProfileId) {
    throw new AppError(
      "CONFLICT",
      "請先建立可預約的服務與服務人員。",
      409,
    );
  }

  const organization = await prisma.organizations.findUniqueOrThrow({
    where: {
      id: input.context.organization.id,
    },
    select: {
      name: true,
      email: true,
      phone: true,
    },
  });
  const sessionToken = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const publicSession = await prisma.public_booking_sessions.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: location.id,
      token_hash: sha256(sessionToken),
      expires_at: expiresAt,
      allowed_origin: new URL(getServerEnv().NEXT_PUBLIC_APP_URL).origin,
    },
    select: {
      id: true,
    },
  });
  const publicContext: PublicSessionContext = {
    sessionId: publicSession.id,
    sessionToken,
    requestId: input.requestId,
    organizationId: input.context.organization.id,
    organizationSlug: input.context.organization.slug,
    organizationName: input.context.organization.name,
    isTest: true,
    locationId: location.id,
    locationSlug: location.slug,
    locationName: location.name,
    timezone: location.timezone,
    currency: "TWD",
  };

  const localToday = formatDateInTimeZone(new Date(), location.timezone);
  let startsAt: string | null = null;
  for (let dayOffset = 1; dayOffset <= 30; dayOffset += 1) {
    const date = addLocalDays(localToday, dayOffset);
    const availability = await getPublicAvailability(publicContext, {
      serviceVariantId: selection.service_variant_id,
      staffProfileId,
      date,
    });
    const slot = availability.slots.find((candidate) =>
      candidate.availableStaff.includes(staffProfileId),
    );
    if (slot) {
      startsAt = slot.startsAt;
      break;
    }
  }
  if (!startsAt) {
    await prisma.public_booking_sessions.update({
      where: {
        id: publicSession.id,
      },
      data: {
        status: "REVOKED",
        revoked_at: new Date(),
      },
    });
    throw new AppError(
      "CONFLICT",
      "未找到未來 30 天可用時段，請檢查班表與資源。",
      409,
    );
  }

  const idempotencyKey = randomUUID();
  const hold = await createBookingHold({
    context: publicContext,
    serviceVariantId: selection.service_variant_id,
    staffProfileId,
    startsAt,
    idempotencyKey,
  });
  const summary = await confirmPublicBooking({
    context: publicContext,
    idempotencyKey: `${idempotencyKey}:confirm`,
    payload: {
      holdToken: hold.holdToken,
      customer: {
        displayName: `${organization.name} 開店測試`,
        phone: organization.phone,
        email: organization.email,
        note: "商家開店流程測試預約",
      },
      consents: {
        service: true,
        marketing: false,
      },
    },
  });

  let booking = await prisma.bookings.findUniqueOrThrow({
    where: {
      id: summary.booking.id,
    },
    select: {
      status: true,
      version: true,
      deposit_required_minor: true,
      paid_minor: true,
    },
  });
  if (booking.status === "PENDING_PAYMENT") {
    const payment = await confirmMerchantPayment({
      context: input.context,
      bookingId: summary.booking.id,
      amountMinor:
        booking.deposit_required_minor - booking.paid_minor,
      expectedVersion: booking.version,
      method: "OTHER",
      note: "開店流程測試付款，不列入正式營收。",
      requestId: `${input.requestId}:test-payment`,
    });
    booking = {
      status: payment.status as typeof booking.status,
      version: payment.version,
      deposit_required_minor: booking.deposit_required_minor,
      paid_minor: payment.paidMinor,
    };
  }

  for (const nextStatus of [
    "CHECKED_IN",
    "IN_SERVICE",
    "COMPLETED",
  ] as const) {
    const updated = await updateMerchantBookingStatus({
      context: input.context,
      bookingId: summary.booking.id,
      nextStatus,
      expectedVersion: booking.version,
      requestId: `${input.requestId}:test-${nextStatus.toLowerCase()}`,
    });
    booking = {
      ...booking,
      status: updated.status as typeof booking.status,
      version: updated.version,
    };
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.merchant_setup_progress.update({
      where: {
        organization_id: input.context.organization.id,
      },
      data: {
        test_booking_id: summary.booking.id,
        test_booking_completed_at: new Date(),
        last_step: "GO_LIVE",
      },
    });
    await transaction.audit_logs.create({
      data: {
        organization_id: input.context.organization.id,
        location_id: location.id,
        actor_profile_id: input.context.session.profileId,
        action: "MERCHANT_SETUP_TEST_BOOKING_COMPLETE",
        target_type: "BOOKING",
        target_id: summary.booking.id,
        outcome: "SUCCESS",
        request_id: input.requestId,
        after_json: {
          isTest: true,
          status: "COMPLETED",
        },
      },
    });
  });
}

async function goLive(input: {
  context: OrganizationContext;
  requestId: string;
}): Promise<string> {
  if (
    !input.context.roles.has("ORGANIZATION_OWNER") &&
    !input.context.roles.has("PLATFORM_ADMIN")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "只有商家負責人可以正式上線。",
      403,
    );
  }
  const location = requireLocation(input.context);
  const now = new Date();

  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`
          select id
          from public.organizations
          where id = ${input.context.organization.id}::uuid
          for update
        `,
      );
      const organization = await transaction.organizations.findUnique({
        where: {
          id: input.context.organization.id,
        },
        select: {
          status: true,
          organization_memberships: {
            where: {
              role: "ORGANIZATION_OWNER",
              status: "ACTIVE",
              is_primary_owner: true,
            },
            select: {
              id: true,
            },
          },
          subscriptions: {
            where: {
              is_current: true,
            },
            take: 1,
            select: {
              status: true,
              trial_ends_at: true,
              billing_period_end: true,
            },
          },
          merchant_setup_progress: {
            select: {
              brand_completed_at: true,
              location_completed_at: true,
              business_hours_completed_at: true,
              service_completed_at: true,
              staff_completed_at: true,
              resource_completed_at: true,
              policies_completed_at: true,
              notifications_completed_at: true,
              test_booking_id: true,
              test_booking_completed_at: true,
              go_live_at: true,
            },
          },
        },
      });
      if (!organization) {
        throw new AppError("NOT_FOUND", "找不到商家資料。", 404);
      }
      if (organization.merchant_setup_progress?.go_live_at) {
        return `/book/${input.context.organization.slug}/${location.slug}`;
      }
      if (organization.organization_memberships.length === 0) {
        throw new AppError(
          "CONFLICT",
          "商家缺少有效的主要負責人。",
          409,
        );
      }
      const subscription = organization.subscriptions[0];
      if (
        !subscription ||
        !["TRIALING", "ACTIVE", "GRACE_PERIOD"].includes(
          subscription.status,
        ) ||
        (subscription.status === "TRIALING" &&
          (!subscription.trial_ends_at ||
            subscription.trial_ends_at <= now))
      ) {
        throw new AppError(
          "SUBSCRIPTION_UNAVAILABLE",
          "目前訂閱狀態無法開放公開預約。",
          403,
        );
      }
      const setup = organization.merchant_setup_progress;
      if (
        !setup ||
        [
          setup.brand_completed_at,
          setup.location_completed_at,
          setup.business_hours_completed_at,
          setup.service_completed_at,
          setup.staff_completed_at,
          setup.resource_completed_at,
          setup.policies_completed_at,
          setup.notifications_completed_at,
          setup.test_booking_completed_at,
        ].some((value) => !value) ||
        !setup.test_booking_id
      ) {
        throw new AppError(
          "CONFLICT",
          "開店設定或測試預約尚未完成。",
          409,
        );
      }
      const completedTestBooking = await transaction.bookings.findFirst({
        where: {
          id: setup.test_booking_id,
          organization_id: input.context.organization.id,
          location_id: location.id,
          is_test: true,
          status: "COMPLETED",
        },
        select: {
          id: true,
        },
      });
      if (!completedTestBooking) {
        throw new AppError(
          "CONFLICT",
          "測試預約尚未完成。",
          409,
        );
      }

      await transaction.organizations.update({
        where: {
          id: input.context.organization.id,
        },
        data: {
          public_profile_enabled: true,
        },
      });
      await transaction.locations.update({
        where: {
          id: location.id,
        },
        data: {
          booking_state: "OPEN",
          online_booking_enabled: true,
        },
      });
      await transaction.merchant_setup_progress.update({
        where: {
          organization_id: input.context.organization.id,
        },
        data: {
          go_live_at: now,
          last_step: "GO_LIVE",
        },
      });
      await transaction.operational_events.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          event_type: "MERCHANT_GO_LIVE",
          target_type: "LOCATION",
          target_id: location.id,
          payload: {
            publicBookingEnabled: true,
          },
        },
      });
      await transaction.audit_logs.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          actor_profile_id: input.context.session.profileId,
          action: "MERCHANT_GO_LIVE",
          target_type: "LOCATION",
          target_id: location.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            publicProfileEnabled: true,
            bookingState: "OPEN",
            onlineBookingEnabled: true,
          },
        },
      });
      return `/book/${input.context.organization.slug}/${location.slug}`;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}

export async function runMerchantSetupAction(input: {
  context: OrganizationContext;
  payload: MerchantSetupActionInput;
  requestId: string;
}): Promise<SetupProgressResult & { publicBookingPath?: string }> {
  switch (input.payload.action) {
    case "BUSINESS_HOURS":
      await configureBusinessHours({
        context: input.context,
        payload: input.payload,
        requestId: input.requestId,
      });
      break;
    case "POLICIES":
      await configurePolicies({
        context: input.context,
        payload: input.payload,
        requestId: input.requestId,
      });
      break;
    case "NOTIFICATIONS":
      await configureNotifications({
        context: input.context,
        payload: input.payload,
        requestId: input.requestId,
      });
      break;
    case "CREATE_TEST_BOOKING":
      await createTestBooking({
        context: input.context,
        requestId: input.requestId,
      });
      break;
    case "GO_LIVE": {
      const publicBookingPath = await goLive({
        context: input.context,
        requestId: input.requestId,
      });
      return {
        ...(await setupProgress(input.context.organization.id)),
        publicBookingPath,
      };
    }
  }

  return setupProgress(input.context.organization.id);
}
