import "server-only";

import { prisma } from "../database/prisma";

const AVAILABLE_ORGANIZATION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
] as const;

export async function resolveSessionDestination(input: {
  profileId: string;
  platformRole: string | null;
}): Promise<string> {
  if (input.platformRole === "PLATFORM_ADMIN") {
    return "/admin/organizations";
  }

  const organizationMembership =
    await prisma.organization_memberships.findFirst({
      where: {
        profile_id: input.profileId,
        status: "ACTIVE",
        organizations: {
          status: {
            in: [...AVAILABLE_ORGANIZATION_STATUSES],
          },
        },
      },
      select: {
        role: true,
        organizations: {
          select: {
            slug: true,
            locations: {
              where: {
                is_active: true,
              },
              select: {
                slug: true,
              },
              orderBy: {
                created_at: "asc",
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        created_at: "asc",
      },
    });

  if (organizationMembership) {
    const organizationSlug = organizationMembership.organizations.slug;
    const locationSlug =
      organizationMembership.organizations.locations[0]?.slug;

    if (organizationMembership.role === "FINANCE_VIEWER") {
      return `/merchant/reports?organization=${organizationSlug}`;
    }

    return locationSlug
      ? `/merchant/dashboard?organization=${organizationSlug}&location=${locationSlug}`
      : `/merchant/locations?organization=${organizationSlug}`;
  }

  const locationMembership = await prisma.location_memberships.findFirst({
    where: {
      profile_id: input.profileId,
      status: "ACTIVE",
      locations: {
        is_active: true,
        organizations: {
          status: {
            in: [...AVAILABLE_ORGANIZATION_STATUSES],
          },
        },
      },
    },
    select: {
      role: true,
      locations: {
        select: {
          slug: true,
          organizations: {
            select: {
              slug: true,
            },
          },
        },
      },
    },
    orderBy: {
      created_at: "asc",
    },
  });

  if (locationMembership) {
    if (locationMembership.role === "SERVICE_PROVIDER") {
      return `/staff/${locationMembership.locations.slug}`;
    }

    return `/merchant/calendar?organization=${locationMembership.locations.organizations.slug}&location=${locationMembership.locations.slug}`;
  }

  const publicLocation = await prisma.locations.findFirst({
    where: {
      is_active: true,
      online_booking_enabled: true,
      booking_state: "OPEN",
      organizations: {
        public_profile_enabled: true,
        status: {
          in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"],
        },
      },
    },
    select: {
      slug: true,
      organizations: {
        select: {
          slug: true,
        },
      },
    },
    orderBy: {
      created_at: "asc",
    },
  });

  return publicLocation
    ? `/book/${publicLocation.organizations.slug}/${publicLocation.slug}`
    : "/";
}
