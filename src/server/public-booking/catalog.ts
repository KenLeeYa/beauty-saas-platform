import "server-only";

import { unstable_cache } from "next/cache";

import { calculateDepositMinor } from "../booking/pricing";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { publicMediaUrl } from "../storage/provider";
import { databaseTimeToString } from "../time/timezone";
import {
  resolvePublicLocation,
  type PublicLocationContext,
} from "./context";

export type PublicCatalog = {
  organization: {
    name: string;
    slug: string;
    description: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
  };
  location: {
    name: string;
    slug: string;
    description: string;
    address: string;
    phone: string;
    timezone: string;
    currency: string;
    maximumAdvanceDays: number;
    minimumLeadMinutes: number;
    customerCancellationEnabled: boolean;
    customerRescheduleEnabled: boolean;
    coverImageUrl: string | null;
  };
  businessHours: Array<{
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
  }>;
  daySchedules: Array<{
    date: string;
    isClosed: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }>;
  services: Array<{
    id: string;
    name: string;
    description: string;
    bookingNotice: string;
    categoryName: string | null;
    imageUrl: string | null;
    variants: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      priceMinor: number;
      depositMinor: number;
      cancellationPolicy: {
        name: string;
        freeCancellationHours: number;
        lateFeeMode: "NONE" | "FIXED" | "PERCENTAGE" | "DEPOSIT_FORFEIT";
        lateFeeFixedMinor: number | null;
        lateFeePercentage: number | null;
      };
      staff: Array<{
        id: string;
        displayName: string;
        title: string;
        skills: string[];
        photoUrl: string | null;
      }>;
    }>;
  }>;
};

export async function getPublicCatalog(
  input: {
    organizationSlug: string;
    locationSlug: string;
  },
): Promise<PublicCatalog> {
  const context = await resolvePublicLocation(input);
  return getPublicCatalogForContext(context);
}

const getCachedPublicCatalogBySlug = unstable_cache(
  async (organizationSlug: string, locationSlug: string) =>
    getPublicCatalog({ organizationSlug, locationSlug }),
  ["public-booking-catalog-v3"],
  {
    revalidate: 30,
    tags: ["public-booking-catalog"],
  },
);

export async function getCachedPublicCatalog(input: {
  organizationSlug: string;
  locationSlug: string;
}): Promise<PublicCatalog> {
  return getCachedPublicCatalogBySlug(
    input.organizationSlug,
    input.locationSlug,
  );
}

export async function getPublicCatalogForContext(
  context: PublicLocationContext,
): Promise<PublicCatalog> {
  const location = await prisma.locations.findUnique({
    where: {
      id: context.locationId,
    },
    select: {
      description: true,
      address: true,
      phone: true,
      cover_image_path: true,
      organizations: {
        select: {
          brand_description: true,
          brand_logo_path: true,
          brand_cover_image_path: true,
        },
      },
      location_booking_policies: {
        select: {
          maximum_advance_days: true,
          minimum_lead_minutes: true,
          deposits_enabled: true,
          customer_cancellation_enabled: true,
          customer_reschedule_enabled: true,
        },
      },
      cancellation_policies: {
        where: {
          is_active: true,
        },
        select: {
          service_variant_id: true,
          name: true,
          free_cancellation_hours: true,
          late_fee_mode: true,
          late_fee_fixed_minor: true,
          late_fee_percentage: true,
        },
      },
      deposit_policies: {
        where: {
          is_active: true,
        },
        select: {
          service_variant_id: true,
          mode: true,
          fixed_amount_minor: true,
          percentage: true,
        },
      },
      location_business_hours: {
        orderBy: [{ day_of_week: "asc" }, { segment_index: "asc" }],
        select: {
          day_of_week: true,
          opens_at: true,
          closes_at: true,
          is_closed: true,
        },
      },
      location_day_schedules: {
        orderBy: [
          { schedule_date: "asc" },
          { segment_index: "asc" },
        ],
        select: {
          schedule_date: true,
          opens_at: true,
          closes_at: true,
          is_closed: true,
        },
      },
      location_services: {
        where: {
          is_active: true,
          online_booking_enabled: true,
          services: {
            is_active: true,
            online_booking_enabled: true,
          },
          service_variants: {
            is_active: true,
          },
        },
        orderBy: {
          sort_order: "asc",
        },
        select: {
          price_override_minor: true,
          duration_override_minutes: true,
          deposit_fixed_override_minor: true,
          deposit_percentage_override: true,
          services: {
            select: {
              id: true,
              name: true,
              description: true,
              booking_notice: true,
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
              id: true,
              name: true,
              duration_minutes: true,
              price_minor: true,
              deposit_fixed_minor: true,
              deposit_percentage: true,
            },
          },
          service_staff_assignments: {
            where: {
              is_active: true,
              online_booking_enabled: true,
              staff_profiles: {
                is_active: true,
                public_visible: true,
              },
            },
            orderBy: {
              staff_profiles: {
                sort_order: "asc",
              },
            },
            select: {
              staff_profiles: {
                select: {
                  id: true,
                  display_name: true,
                  title: true,
                  skills: true,
                  photo_path: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!location) {
    throw new AppError("NOT_FOUND", "找不到可預約的店家。", 404);
  }

  const servicesById = new Map<string, PublicCatalog["services"][number]>();
  for (const item of location.location_services) {
    const service = item.services;
    const variant = item.service_variants;
    let publicService = servicesById.get(service.id);
    if (!publicService) {
      publicService = {
        id: service.id,
        name: service.name,
        description: service.description,
        bookingNotice: service.booking_notice,
        categoryName: service.service_categories?.name ?? null,
        imageUrl: publicMediaUrl(service.image_path),
        variants: [],
      };
      servicesById.set(service.id, publicService);
    }

    const priceMinor = item.price_override_minor ?? variant.price_minor;
    const depositPolicy =
      location.deposit_policies.find(
        (policy) => policy.service_variant_id === variant.id,
      ) ??
      location.deposit_policies.find(
        (policy) => policy.service_variant_id === null,
      );
    const cancellationPolicy =
      location.cancellation_policies.find(
        (policy) => policy.service_variant_id === variant.id,
      ) ??
      location.cancellation_policies.find(
        (policy) => policy.service_variant_id === null,
      );
    const depositsEnabled =
      location.location_booking_policies?.deposits_enabled ?? false;
    const depositMinor = depositsEnabled
      ? item.deposit_fixed_override_minor !== null
        ? calculateDepositMinor(priceMinor, {
            mode: "FIXED",
            fixedAmountMinor: item.deposit_fixed_override_minor,
          })
        : item.deposit_percentage_override !== null
          ? calculateDepositMinor(priceMinor, {
              mode: "PERCENTAGE",
              percentage: Number(item.deposit_percentage_override),
            })
          : variant.deposit_fixed_minor !== null
            ? calculateDepositMinor(priceMinor, {
                mode: "FIXED",
                fixedAmountMinor: variant.deposit_fixed_minor,
              })
            : variant.deposit_percentage !== null
              ? calculateDepositMinor(priceMinor, {
                  mode: "PERCENTAGE",
                  percentage: Number(variant.deposit_percentage),
                })
              : depositPolicy?.mode === "FIXED"
                ? calculateDepositMinor(priceMinor, {
                    mode: "FIXED",
                    fixedAmountMinor:
                      depositPolicy.fixed_amount_minor ?? 0,
                  })
                : depositPolicy?.mode === "PERCENTAGE"
                  ? calculateDepositMinor(priceMinor, {
                      mode: "PERCENTAGE",
                      percentage: Number(
                        depositPolicy.percentage ?? 0,
                      ),
                    })
                  : 0
      : 0;

    publicService.variants.push({
      id: variant.id,
      name: variant.name,
      durationMinutes:
        item.duration_override_minutes ?? variant.duration_minutes,
      priceMinor,
      depositMinor,
      cancellationPolicy: {
        name: cancellationPolicy?.name ?? "一般取消規則",
        freeCancellationHours:
          cancellationPolicy?.free_cancellation_hours ?? 24,
        lateFeeMode: cancellationPolicy?.late_fee_mode ?? "NONE",
        lateFeeFixedMinor:
          cancellationPolicy?.late_fee_fixed_minor ?? null,
        lateFeePercentage:
          cancellationPolicy?.late_fee_percentage !== null &&
          cancellationPolicy?.late_fee_percentage !== undefined
            ? Number(cancellationPolicy.late_fee_percentage)
            : null,
      },
      staff: item.service_staff_assignments.map(({ staff_profiles }) => ({
        id: staff_profiles.id,
        displayName: staff_profiles.display_name,
        title: staff_profiles.title,
        skills: staff_profiles.skills,
        photoUrl: publicMediaUrl(staff_profiles.photo_path),
      })),
    });
  }

  return {
    organization: {
      name: context.organizationName,
      slug: context.organizationSlug,
      description: location.organizations.brand_description,
      logoUrl: publicMediaUrl(location.organizations.brand_logo_path),
      coverImageUrl: publicMediaUrl(
        location.organizations.brand_cover_image_path,
      ),
    },
    location: {
      name: context.locationName,
      slug: context.locationSlug,
      description: location.description,
      address: location.address,
      phone: location.phone,
      timezone: context.timezone,
      currency: context.currency,
      maximumAdvanceDays:
        location.location_booking_policies?.maximum_advance_days ?? 60,
      minimumLeadMinutes:
        location.location_booking_policies?.minimum_lead_minutes ?? 60,
      customerCancellationEnabled:
        location.location_booking_policies
          ?.customer_cancellation_enabled ?? true,
      customerRescheduleEnabled:
        location.location_booking_policies?.customer_reschedule_enabled ??
        true,
      coverImageUrl: publicMediaUrl(location.cover_image_path),
    },
    businessHours: location.location_business_hours.map((hours) => ({
      dayOfWeek: hours.day_of_week,
      opensAt: databaseTimeToString(hours.opens_at),
      closesAt: databaseTimeToString(hours.closes_at),
      isClosed: hours.is_closed,
    })),
    daySchedules: location.location_day_schedules.map((schedule) => ({
      date: schedule.schedule_date.toISOString().slice(0, 10),
      isClosed: schedule.is_closed,
      opensAt: schedule.opens_at
        ? databaseTimeToString(schedule.opens_at)
        : null,
      closesAt: schedule.closes_at
        ? databaseTimeToString(schedule.closes_at)
        : null,
    })),
    services: [...servicesById.values()],
  };
}
