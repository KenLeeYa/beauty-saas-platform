import "server-only";

import {
  capabilitiesForRoles,
  hasCapability,
} from "../authorization/capabilities";
import type { OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { getEntitlement } from "../entitlements/service";
import { canShowModule } from "../entitlements/module-visibility";
import { requireLocation } from "../authorization/context";
import { AppError } from "../http/errors";
import { publicMediaUrl } from "../storage/provider";
import {
  addLocalDays,
  databaseTimeToString,
  formatDateInTimeZone,
  zonedDateTimeToUtc,
} from "../time/timezone";

export type MerchantWorkspaceData = {
  session: {
    displayName: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    businessName: string;
    entityType: string;
    email: string;
    phone: string;
    brandDescription: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
  };
  location: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    bookingState: string;
    onlineBookingEnabled: boolean;
    description: string;
    address: string;
    phone: string;
    coverImageUrl: string | null;
  };
  features: {
    deposits: boolean;
    customerBlacklist: boolean;
  };
  bookingSettings: {
    depositsEnabled: boolean;
    depositMode: "FIXED" | "PERCENTAGE";
    depositAmountMinor: number;
    depositPercentage: number;
    customerCancellationEnabled: boolean;
    customerRescheduleEnabled: boolean;
    cancellationCutoffHours: number;
  };
  capabilities: string[];
  stats: {
    todayBookings: number;
    pendingBookings: number;
    confirmedBookings: number;
    monthRevenueMinor: number;
    currency: string;
  };
  calendarDays: Array<{
    date: string;
    availableCount: number;
    bookedCount: number;
    closedCount: number;
    scheduleMode: "NORMAL" | "CUSTOM" | "CLOSED";
    scheduleReason: string;
    scheduleSegments: Array<{
      startsAt: string;
      endsAt: string;
    }>;
    defaultScheduleSegments: Array<{
      startsAt: string;
      endsAt: string;
    }>;
  }>;
  bookings: Array<{
    id: string;
    status: string;
    paymentStatus: string;
    version: number;
    totalMinor: number;
    depositRequiredMinor: number;
    paidMinor: number;
    currency: string;
    customerName: string;
    customerPhone: string | null;
    serviceName: string;
    variantName: string;
    staffName: string | null;
    startsAt: string;
    endsAt: string;
    source: string;
  }>;
  services: Array<{
    id: string;
    locationServiceId: string;
    name: string;
    variantName: string;
    durationMinutes: number;
    priceMinor: number;
    preBufferMinutes: number;
    postBufferMinutes: number;
    onlineBookingEnabled: boolean;
    staffCount: number;
    categoryName: string | null;
    imageUrl: string | null;
  }>;
  staff: Array<{
    id: string;
    displayName: string;
    title: string;
    skills: string[];
    isActive: boolean;
    photoUrl: string | null;
  }>;
  resources: Array<{
    id: string;
    name: string;
    typeName: string;
    kind: string;
    isActive: boolean;
  }>;
  customers: Array<{
    id: string;
    displayName: string;
    phone: string | null;
    birthday: string | null;
    depositMode: "DEFAULT" | "REQUIRED" | "EXEMPT";
    isBlacklisted: boolean;
    blacklistReason: string | null;
    lastServiceAt: string | null;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    totalSpendMinor: string;
    tags: Array<{
      id: string;
      name: string;
      color: string | null;
    }>;
    notes: Array<{
      id: string;
      note: string;
      sensitivity: "STANDARD" | "SENSITIVE" | "MEDICAL";
      createdAt: string;
      authorName: string;
    }>;
  }>;
  customerTags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  locations: Array<{
    id: string;
    name: string;
    slug: string;
    code: string;
    bookingState: string;
    onlineBookingEnabled: boolean;
    description: string;
    address: string;
    phone: string;
    coverImageUrl: string | null;
  }>;
  subscription: {
    status: string;
    planName: string;
    periodEnd: string | null;
  } | null;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalMinor: number;
    amountPaidMinor: number;
    currency: string;
    dueAt: string | null;
    createdAt: string;
  }>;
  setup: {
    lastStep: string;
    goLiveAt: string | null;
    completedSteps: number;
    totalSteps: number;
    steps: {
      brand: boolean;
      location: boolean;
      businessHours: boolean;
      service: boolean;
      staff: boolean;
      resource: boolean;
      policies: boolean;
      notifications: boolean;
      testBooking: boolean;
    };
  } | null;
  notificationIntegrations: Array<{
    channel: string;
    status: string;
    lastVerifiedAt: string | null;
    lastErrorCode: string | null;
  }>;
  notificationHealth: {
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
  };
  notificationDeliveries: Array<{
    id: string;
    jobId: string;
    channel: string;
    eventType: string;
    status: string;
    jobStatus: string;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt: string | null;
    errorCode: string | null;
    createdAt: string;
  }>;
};

export async function getMerchantWorkspaceData(
  context: OrganizationContext,
): Promise<MerchantWorkspaceData> {
  const location = requireLocation(context);
  const ownBookingsOnly = hasCapability(context.roles, "booking.own.read") &&
    !hasCapability(context.roles, "booking.read");
  if (ownBookingsOnly && !context.linkedStaffProfileId) {
    throw new AppError("FORBIDDEN", "此帳號尚未連結服務人員資料。", 403);
  }
  const now = new Date();
  const localToday = formatDateInTimeZone(now, location.timezone);
  const rangeStartDate = addLocalDays(localToday, -35);
  const rangeEndDate = addLocalDays(localToday, 95);
  const rangeStart = zonedDateTimeToUtc(
    rangeStartDate,
    "00:00",
    location.timezone,
  );
  const rangeEnd = zonedDateTimeToUtc(
    rangeEndDate,
    "00:00",
    location.timezone,
  );
  const currentMonthStart = `${localToday.slice(0, 7)}-01`;
  const nextMonthStart = addLocalDays(
    currentMonthStart,
    new Date(
      Date.UTC(
        Number(currentMonthStart.slice(0, 4)),
        Number(currentMonthStart.slice(5, 7)),
        0,
      ),
    ).getUTCDate(),
  );
  const monthStartUtc = zonedDateTimeToUtc(
    currentMonthStart,
    "00:00",
    location.timezone,
  );
  const nextMonthStartUtc = zonedDateTimeToUtc(
    nextMonthStart,
    "00:00",
    location.timezone,
  );
  const canReadBookings =
    hasCapability(context.roles, "booking.read") ||
    hasCapability(context.roles, "booking.own.read");
  const canReadCustomers = hasCapability(
    context.roles,
    "customer.read",
  );
  const canReadSensitiveCustomers = hasCapability(
    context.roles,
    "customer.sensitive.read",
  );
  const canReadNotificationStatus =
    hasCapability(context.roles, "organization.manage") ||
    hasCapability(context.roles, "booking.manage");
  const canReadBilling = hasCapability(context.roles, "billing.read");

  const [
    locationRecord,
    bookingRecords,
    serviceRecords,
    staffRecords,
    resourceRecords,
    customerRecords,
    customerTagRecords,
    locationRecords,
    organizationRecord,
    notificationIntegrationRecords,
    invoiceRecords,
    notificationDeliveryRecords,
    notificationJobStatusRecords,
    depositEntitlement,
    blacklistEntitlement,
  ] = await Promise.all([
    prisma.locations.findUniqueOrThrow({
      where: { id: location.id },
      select: {
        booking_state: true,
        online_booking_enabled: true,
        currency: true,
        description: true,
        address: true,
        phone: true,
        cover_image_path: true,
        location_booking_policies: {
          select: {
            deposits_enabled: true,
            customer_cancellation_enabled: true,
            customer_reschedule_enabled: true,
            cancellation_cutoff_hours: true,
          },
        },
        deposit_policies: {
          where: {
            service_variant_id: null,
            is_active: true,
          },
          take: 1,
          select: {
            mode: true,
            fixed_amount_minor: true,
            percentage: true,
          },
        },
        location_business_hours: {
          select: {
            day_of_week: true,
            opens_at: true,
            closes_at: true,
            is_closed: true,
          },
        },
        location_day_schedules: {
          where: {
            schedule_date: {
              gte: new Date(`${rangeStartDate}T00:00:00.000Z`),
              lt: new Date(`${rangeEndDate}T00:00:00.000Z`),
            },
          },
          orderBy: [
            { schedule_date: "asc" },
            { segment_index: "asc" },
          ],
          select: {
            schedule_date: true,
            opens_at: true,
            closes_at: true,
            is_closed: true,
            reason: true,
          },
        },
      },
    }),
    canReadBookings
      ? prisma.bookings.findMany({
          where: {
            organization_id: context.organization.id,
            location_id: location.id,
            booking_segments: {
              some: {
                starts_at: {
                  gte: rangeStart,
                  lt: rangeEnd,
                },
                ...(ownBookingsOnly
                  ? {
                      assigned_staff_id:
                        context.linkedStaffProfileId,
                    }
                  : {}),
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
          take: 500,
          select: {
            id: true,
            status: true,
            payment_status: true,
            version: true,
            total_minor: true,
            deposit_required_minor: true,
            paid_minor: true,
            currency: true,
            source: true,
            customers: {
              select: {
                display_name: true,
                customer_contacts: {
                  where: {
                    contact_type: "PHONE",
                    is_primary: true,
                  },
                  take: 1,
                  select: {
                    value: true,
                  },
                },
              },
            },
            booking_segments: {
              ...(ownBookingsOnly ? { where: {
                assigned_staff_id: context.linkedStaffProfileId,
                starts_at: { gte: rangeStart, lt: rangeEnd },
              } } : {}),
              orderBy: {
                sort_order: "asc",
              },
              take: 1,
              select: {
                service_name_snapshot: true,
                variant_name_snapshot: true,
                staff_name_snapshot: true,
                starts_at: true,
                ends_at: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    hasCapability(context.roles, "catalog.read")
      ? prisma.location_services.findMany({
          where: {
            organization_id: context.organization.id,
            location_id: location.id,
            is_active: true,
          },
          orderBy: {
            sort_order: "asc",
          },
          select: {
            id: true,
            online_booking_enabled: true,
            price_override_minor: true,
            duration_override_minutes: true,
            services: {
              select: {
                id: true,
                name: true,
                image_path: true,
                service_categories: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            service_variants: {
              select: {
                name: true,
                duration_minutes: true,
                price_minor: true,
                pre_buffer_minutes: true,
                post_buffer_minutes: true,
              },
            },
            service_staff_assignments: {
              where: {
                is_active: true,
              },
              select: {
                id: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    hasCapability(context.roles, "staff.read")
      ? prisma.staff_profiles.findMany({
          where: {
            organization_id: context.organization.id,
            staff_location_assignments: {
              some: {
                location_id: location.id,
                is_active: true,
              },
            },
          },
          orderBy: {
            sort_order: "asc",
          },
          select: {
            id: true,
            display_name: true,
            title: true,
            skills: true,
            is_active: true,
            photo_path: true,
          },
        })
      : Promise.resolve([]),
    hasCapability(context.roles, "resource.read")
      ? prisma.resources.findMany({
          where: {
            organization_id: context.organization.id,
            location_id: location.id,
          },
          orderBy: {
            sort_order: "asc",
          },
          select: {
            id: true,
            name: true,
            is_active: true,
            resource_types: {
              select: {
                name: true,
                kind: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    canReadCustomers
      ? prisma.customers.findMany({
          where: {
            organization_id: context.organization.id,
            is_active: true,
          },
          orderBy: {
            created_at: "desc",
          },
          take: 100,
          select: {
            id: true,
            display_name: true,
            birthday: true,
            deposit_mode: true,
            is_blacklisted: true,
            blacklist_reason: true,
            customer_contacts: {
              where: {
                contact_type: "PHONE",
                is_primary: true,
              },
              take: 1,
              select: {
                value: true,
              },
            },
            customer_metrics: {
              select: {
                last_service_at: true,
                completed_count: true,
                cancelled_count: true,
                no_show_count: true,
                total_spend_minor: true,
              },
            },
            customer_tag_assignments: {
              orderBy: {
                created_at: "asc",
              },
              select: {
                customer_tags: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
              },
            },
            customer_notes: {
              where: {
                deleted_at: null,
                ...(canReadSensitiveCustomers
                  ? {}
                  : { sensitivity: "STANDARD" as const }),
              },
              orderBy: {
                created_at: "desc",
              },
              take: 5,
              select: {
                id: true,
                note: true,
                sensitivity: true,
                created_at: true,
                profiles_customer_notes_created_byToprofiles: {
                  select: {
                    display_name: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    canReadCustomers
      ? prisma.customer_tags.findMany({
          where: {
            organization_id: context.organization.id,
          },
          orderBy: {
            name: "asc",
          },
          select: {
            id: true,
            name: true,
            color: true,
          },
        })
      : Promise.resolve([]),
    prisma.locations.findMany({
      where: {
        organization_id: context.organization.id,
        id: {
          in: [...context.accessibleLocationIds],
        },
        is_active: true,
      },
      orderBy: {
        created_at: "asc",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        booking_state: true,
        online_booking_enabled: true,
        description: true,
        address: true,
        phone: true,
        cover_image_path: true,
      },
    }),
    prisma.organizations.findUniqueOrThrow({
      where: {
        id: context.organization.id,
      },
      select: {
        business_name: true,
        entity_type: true,
        email: true,
        phone: true,
        brand_description: true,
        brand_logo_path: true,
        brand_cover_image_path: true,
        subscriptions: {
          where: {
            is_current: true,
          },
          take: 1,
          select: {
            status: true,
            billing_period_end: true,
            plan_versions: {
              select: {
                plans: {
                  select: {
                    display_name: true,
                  },
                },
              },
            },
          },
        },
        merchant_setup_progress: {
          select: {
            last_step: true,
            go_live_at: true,
            brand_completed_at: true,
            location_completed_at: true,
            business_hours_completed_at: true,
            service_completed_at: true,
            staff_completed_at: true,
            resource_completed_at: true,
            policies_completed_at: true,
            notifications_completed_at: true,
            test_booking_completed_at: true,
            test_booking_id: true,
          },
        },
      },
    }),
    canReadNotificationStatus
      ? prisma.notification_integrations.findMany({
          where: {
            organization_id: context.organization.id,
          },
          orderBy: {
            channel: "asc",
          },
          select: {
            channel: true,
            status: true,
            last_verified_at: true,
            last_error_code: true,
          },
        })
      : Promise.resolve([]),
    canReadBilling
      ? prisma.invoices.findMany({
          where: {
            organization_id: context.organization.id,
          },
          orderBy: {
            created_at: "desc",
          },
          take: 50,
          select: {
            id: true,
            invoice_number: true,
            status: true,
            total_minor: true,
            amount_paid_minor: true,
            currency: true,
            due_at: true,
            created_at: true,
          },
        })
      : Promise.resolve([]),
    canReadNotificationStatus
      ? prisma.notification_deliveries.findMany({
          where: {
            organization_id: context.organization.id,
            notification_jobs: {
              notification_outbox: {
                location_id: location.id,
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
          take: 20,
          select: {
            id: true,
            channel: true,
            status: true,
            error_code: true,
            created_at: true,
            notification_jobs: {
              select: {
                id: true,
                status: true,
                attempt_count: true,
                max_attempts: true,
                next_attempt_at: true,
                notification_outbox: {
                  select: {
                    event_type: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    canReadNotificationStatus
      ? prisma.notification_jobs.groupBy({
          by: ["status"],
          where: {
            organization_id: context.organization.id,
            notification_outbox: {
              location_id: location.id,
            },
          },
          _count: {
            _all: true,
          },
        })
      : Promise.resolve([]),
    getEntitlement(context.organization.id, "DEPOSITS"),
    getEntitlement(context.organization.id, "CUSTOMER_BLACKLIST"),
  ]);

  const bookings = bookingRecords.flatMap((booking) => {
    const segment = booking.booking_segments[0];
    if (!segment) {
      return [];
    }
    return [
      {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.payment_status,
        version: booking.version,
        totalMinor: booking.total_minor,
        depositRequiredMinor: booking.deposit_required_minor,
        paidMinor: booking.paid_minor,
        currency: booking.currency,
        customerName: booking.customers.display_name,
        customerPhone:
          canReadSensitiveCustomers
            ? booking.customers.customer_contacts[0]?.value ?? null
            : null,
        serviceName: segment.service_name_snapshot,
        variantName: segment.variant_name_snapshot,
        staffName: segment.staff_name_snapshot,
        startsAt: segment.starts_at.toISOString(),
        endsAt: segment.ends_at.toISOString(),
        source: booking.source,
      },
    ];
  });
  const bookingCountsByDate = new Map<string, number>();
  for (const booking of bookings) {
    const date = formatDateInTimeZone(
      new Date(booking.startsAt),
      location.timezone,
    );
    bookingCountsByDate.set(
      date,
      (bookingCountsByDate.get(date) ?? 0) + 1,
    );
  }
  const openDayOfWeek = new Set(
    locationRecord.location_business_hours
      .filter((hours) => !hours.is_closed)
      .map((hours) => hours.day_of_week),
  );
  const daySchedulesByDate = new Map<
    string,
    typeof locationRecord.location_day_schedules
  >();
  for (const schedule of locationRecord.location_day_schedules) {
    const date = schedule.schedule_date.toISOString().slice(0, 10);
    const schedules = daySchedulesByDate.get(date) ?? [];
    schedules.push(schedule);
    daySchedulesByDate.set(date, schedules);
  }
  const calendarDays = Array.from({ length: 130 }, (_, index) => {
    const date = addLocalDays(rangeStartDate, index);
    const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const schedules = daySchedulesByDate.get(date);
    const closed = schedules?.some((schedule) => schedule.is_closed) ?? false;
    const customSegments =
      schedules?.flatMap((schedule) =>
        !schedule.is_closed && schedule.opens_at && schedule.closes_at
          ? [
              {
                startsAt: databaseTimeToString(schedule.opens_at),
                endsAt: databaseTimeToString(schedule.closes_at),
              },
            ]
          : [],
      ) ?? [];
    const weeklySegments = locationRecord.location_business_hours.flatMap(
      (hours) =>
        hours.day_of_week === dayOfWeek && !hours.is_closed
          ? [
              {
                startsAt: databaseTimeToString(hours.opens_at),
                endsAt: databaseTimeToString(hours.closes_at),
              },
            ]
          : [],
    );
    const scheduleMode: MerchantWorkspaceData["calendarDays"][number]["scheduleMode"] = closed
      ? "CLOSED"
      : customSegments.length > 0
        ? "CUSTOM"
        : "NORMAL";
    const open =
      scheduleMode === "CUSTOM" ||
      (scheduleMode === "NORMAL" && openDayOfWeek.has(dayOfWeek));
    return {
      date,
      availableCount: open ? 1 : 0,
      bookedCount: bookingCountsByDate.get(date) ?? 0,
      closedCount: open ? 0 : 1,
      scheduleMode,
      scheduleReason: schedules?.[0]?.reason ?? "",
      scheduleSegments:
        scheduleMode === "CUSTOM" ? customSegments : weeklySegments,
      defaultScheduleSegments: weeklySegments,
    };
  });
  const localMonthBookings = bookings.filter((booking) => {
    const startsAt = new Date(booking.startsAt);
    return startsAt >= monthStartUtc && startsAt < nextMonthStartUtc;
  });
  const subscription = organizationRecord.subscriptions[0];
  const setup = organizationRecord.merchant_setup_progress;
  const completedSteps = setup
    ? [
        setup.brand_completed_at,
        setup.location_completed_at,
        setup.business_hours_completed_at,
        setup.service_completed_at,
        setup.staff_completed_at,
        setup.resource_completed_at,
        setup.policies_completed_at,
        setup.notifications_completed_at,
        setup.test_booking_completed_at ?? setup.go_live_at,
      ].filter(Boolean).length
    : 0;
  const notificationCountByStatus = new Map(
    notificationJobStatusRecords.map((record) => [
      record.status,
      record._count._all,
    ]),
  );

  const crmVisible=await canShowModule(context,"CUSTOMER_CRM");
  return {
    session: {
      displayName: context.session.displayName,
      email: context.session.email,
    },
    organization: {
      ...context.organization,
      businessName: organizationRecord.business_name,
      entityType: organizationRecord.entity_type,
      email: organizationRecord.email,
      phone: organizationRecord.phone,
      brandDescription: organizationRecord.brand_description,
      logoUrl: publicMediaUrl(organizationRecord.brand_logo_path),
      coverImageUrl: publicMediaUrl(
        organizationRecord.brand_cover_image_path,
      ),
    },
    location: {
      id: location.id,
      name: location.name,
      slug: location.slug,
      timezone: location.timezone,
      bookingState: locationRecord.booking_state,
      onlineBookingEnabled:
        locationRecord.online_booking_enabled,
      description: locationRecord.description,
      address: locationRecord.address,
      phone: locationRecord.phone,
      coverImageUrl: publicMediaUrl(locationRecord.cover_image_path),
    },
    features: {
      deposits: depositEntitlement.enabled,
      customerBlacklist: blacklistEntitlement.enabled,
    },
    bookingSettings: {
      depositsEnabled:
        locationRecord.location_booking_policies?.deposits_enabled ??
        false,
      depositMode:
        locationRecord.deposit_policies[0]?.mode === "PERCENTAGE"
          ? "PERCENTAGE"
          : "FIXED",
      depositAmountMinor:
        locationRecord.deposit_policies[0]?.fixed_amount_minor ?? 50000,
      depositPercentage: Number(
        locationRecord.deposit_policies[0]?.percentage ?? 30,
      ),
      customerCancellationEnabled:
        locationRecord.location_booking_policies
          ?.customer_cancellation_enabled ?? true,
      customerRescheduleEnabled:
        locationRecord.location_booking_policies
          ?.customer_reschedule_enabled ?? true,
      cancellationCutoffHours:
        locationRecord.location_booking_policies
          ?.cancellation_cutoff_hours ?? 24,
    },
    capabilities: [
      ...capabilitiesForRoles(context.roles),
    ],
    stats: {
      todayBookings: bookings.filter(
        (booking) =>
          formatDateInTimeZone(
            new Date(booking.startsAt),
            location.timezone,
          ) === localToday,
      ).length,
      pendingBookings: bookings.filter(
        (booking) => booking.status === "PENDING_PAYMENT",
      ).length,
      confirmedBookings: bookings.filter((booking) =>
        ["CONFIRMED", "CHECKED_IN", "IN_SERVICE"].includes(
          booking.status,
        ),
      ).length,
      monthRevenueMinor: localMonthBookings
        .filter((booking) => booking.status === "COMPLETED")
        .reduce((sum, booking) => sum + booking.totalMinor, 0),
      currency: locationRecord.currency,
    },
    calendarDays,
    bookings,
    services: serviceRecords.map((service) => ({
      id: service.services.id,
      locationServiceId: service.id,
      name: service.services.name,
      variantName: service.service_variants.name,
      durationMinutes:
        service.duration_override_minutes ??
        service.service_variants.duration_minutes,
      priceMinor:
        service.price_override_minor ??
        service.service_variants.price_minor,
      preBufferMinutes: service.service_variants.pre_buffer_minutes,
      postBufferMinutes: service.service_variants.post_buffer_minutes,
      onlineBookingEnabled: service.online_booking_enabled,
      staffCount: service.service_staff_assignments.length,
      categoryName: service.services.service_categories?.name ?? null,
      imageUrl: publicMediaUrl(service.services.image_path),
    })),
    staff: staffRecords.map((staff) => ({
      id: staff.id,
      displayName: staff.display_name,
      title: staff.title,
      skills: staff.skills,
      isActive: staff.is_active,
      photoUrl: publicMediaUrl(staff.photo_path),
    })),
    resources: resourceRecords.map((resource) => ({
      id: resource.id,
      name: resource.name,
      typeName: resource.resource_types.name,
      kind: resource.resource_types.kind,
      isActive: resource.is_active,
    })),
    customerTags: customerTagRecords.filter(()=>crmVisible).map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
    customers: customerRecords.filter(()=>crmVisible).map((customer) => ({
      id: customer.id,
      displayName: customer.display_name,
      phone: canReadSensitiveCustomers
        ? customer.customer_contacts[0]?.value ?? null
        : null,
      birthday: customer.birthday?.toISOString().slice(0, 10) ?? null,
      depositMode: customer.deposit_mode,
      isBlacklisted: customer.is_blacklisted,
      blacklistReason: customer.blacklist_reason,
      lastServiceAt:
        customer.customer_metrics?.last_service_at?.toISOString() ??
        null,
      completedCount:
        customer.customer_metrics?.completed_count ?? 0,
      cancelledCount:
        customer.customer_metrics?.cancelled_count ?? 0,
      noShowCount: customer.customer_metrics?.no_show_count ?? 0,
      totalSpendMinor:
        customer.customer_metrics?.total_spend_minor.toString() ??
        "0",
      tags: customer.customer_tag_assignments.map(
        (assignment) => ({
          id: assignment.customer_tags.id,
          name: assignment.customer_tags.name,
          color: assignment.customer_tags.color,
        }),
      ),
      notes: customer.customer_notes.map((note) => ({
        id: note.id,
        note: note.note,
        sensitivity: note.sensitivity,
        createdAt: note.created_at.toISOString(),
        authorName:
          note.profiles_customer_notes_created_byToprofiles.display_name,
      })),
    })),
    locations: locationRecords.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      code: item.code,
      bookingState: item.booking_state,
      onlineBookingEnabled: item.online_booking_enabled,
      description: item.description,
      address: item.address,
      phone: item.phone,
      coverImageUrl: publicMediaUrl(item.cover_image_path),
    })),
    subscription: subscription
      ? {
          status: subscription.status,
          planName:
            subscription.plan_versions.plans.display_name,
          periodEnd:
            subscription.billing_period_end?.toISOString() ?? null,
        }
      : null,
    invoices: invoiceRecords.map((invoice) => ({
      id: invoice.id,
      number: invoice.invoice_number,
      status: invoice.status,
      totalMinor: invoice.total_minor,
      amountPaidMinor: invoice.amount_paid_minor,
      currency: invoice.currency,
      dueAt: invoice.due_at?.toISOString() ?? null,
      createdAt: invoice.created_at.toISOString(),
    })),
    setup: setup
      ? {
          lastStep: setup.last_step ?? "BRAND",
          goLiveAt: setup.go_live_at?.toISOString() ?? null,
          completedSteps,
          totalSteps: 9,
          steps: {
            brand: Boolean(setup.brand_completed_at),
            location: Boolean(setup.location_completed_at),
            businessHours: Boolean(
              setup.business_hours_completed_at,
            ),
            service: Boolean(setup.service_completed_at),
            staff: Boolean(setup.staff_completed_at),
            resource: Boolean(setup.resource_completed_at),
            policies: Boolean(setup.policies_completed_at),
            notifications: Boolean(
              setup.notifications_completed_at,
            ),
            testBooking: Boolean(
              setup.test_booking_completed_at ?? setup.go_live_at,
            ),
          },
        }
      : null,
    notificationIntegrations: notificationIntegrationRecords.map(
      (integration) => ({
        channel: integration.channel,
        status: integration.status,
        lastVerifiedAt:
          integration.last_verified_at?.toISOString() ?? null,
        lastErrorCode: integration.last_error_code,
      }),
    ),
    notificationHealth: {
      pending: notificationCountByStatus.get("PENDING") ?? 0,
      processing: notificationCountByStatus.get("PROCESSING") ?? 0,
      failed: notificationCountByStatus.get("FAILED") ?? 0,
      deadLetter: notificationCountByStatus.get("DEAD_LETTER") ?? 0,
    },
    notificationDeliveries: notificationDeliveryRecords.map(
      (delivery) => ({
        id: delivery.id,
        jobId: delivery.notification_jobs.id,
        channel: delivery.channel,
        eventType:
          delivery.notification_jobs.notification_outbox.event_type,
        status: delivery.status,
        jobStatus: delivery.notification_jobs.status,
        attemptCount: delivery.notification_jobs.attempt_count,
        maxAttempts: delivery.notification_jobs.max_attempts,
        nextAttemptAt:
          delivery.notification_jobs.next_attempt_at?.toISOString() ??
          null,
        errorCode: delivery.error_code,
        createdAt: delivery.created_at.toISOString(),
      }),
    ),
  };
}
