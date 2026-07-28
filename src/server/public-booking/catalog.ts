import "server-only";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { databaseTimeToString } from "../time/timezone";
import {
  resolvePublicLocation,
  type PublicLocationContext,
} from "./context";

export type PublicCatalog = {
  organization: {
    name: string;
    slug: string;
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
  };
  businessHours: Array<{
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    description: string;
    bookingNotice: string;
    categoryName: string | null;
    variants: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      priceMinor: number;
      depositMinor: number;
      staff: Array<{
        id: string;
        displayName: string;
        title: string;
        skills: string[];
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
      location_booking_policies: {
        select: {
          maximum_advance_days: true,
          minimum_lead_minutes: true,
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
          services: {
            select: {
              id: true,
              name: true,
              description: true,
              booking_notice: true,
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
        variants: [],
      };
      servicesById.set(service.id, publicService);
    }

    const priceMinor = item.price_override_minor ?? variant.price_minor;
    const depositMinor = variant.deposit_fixed_minor
      ? Math.min(priceMinor, variant.deposit_fixed_minor)
      : variant.deposit_percentage
        ? Math.round(
            (priceMinor * Number(variant.deposit_percentage)) / 100,
          )
        : 0;

    publicService.variants.push({
      id: variant.id,
      name: variant.name,
      durationMinutes:
        item.duration_override_minutes ?? variant.duration_minutes,
      priceMinor,
      depositMinor,
      staff: item.service_staff_assignments.map(({ staff_profiles }) => ({
        id: staff_profiles.id,
        displayName: staff_profiles.display_name,
        title: staff_profiles.title,
        skills: staff_profiles.skills,
      })),
    });
  }

  return {
    organization: {
      name: context.organizationName,
      slug: context.organizationSlug,
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
    },
    businessHours: location.location_business_hours.map((hours) => ({
      dayOfWeek: hours.day_of_week,
      opensAt: databaseTimeToString(hours.opens_at),
      closesAt: databaseTimeToString(hours.closes_at),
      isClosed: hours.is_closed,
    })),
    services: [...servicesById.values()],
  };
}
