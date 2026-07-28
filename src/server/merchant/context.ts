import "server-only";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import type { ApplicationSession } from "../auth/session";
import {
  resolveOrganizationContext,
  type OrganizationContext,
} from "../authorization/context";

export async function resolveMerchantContext(input: {
  session: ApplicationSession;
  organizationSlug?: string;
  locationSlug?: string;
}): Promise<OrganizationContext> {
  let organizationSlug = input.organizationSlug;
  let locationSlug = input.locationSlug;

  if (!organizationSlug) {
    const organizationMembership =
      await prisma.organization_memberships.findFirst({
        where: {
          profile_id: input.session.profileId,
          status: "ACTIVE",
        },
        orderBy: {
          created_at: "asc",
        },
        select: {
          organizations: {
            select: {
              slug: true,
              locations: {
                where: {
                  is_active: true,
                },
                orderBy: {
                  created_at: "asc",
                },
                take: 1,
                select: {
                  slug: true,
                },
              },
            },
          },
        },
      });
    const locationMembership =
      organizationMembership || input.session.platformRole === "PLATFORM_ADMIN"
        ? null
        : await prisma.location_memberships.findFirst({
            where: {
              profile_id: input.session.profileId,
              status: "ACTIVE",
              locations: {
                is_active: true,
              },
            },
            orderBy: {
              created_at: "asc",
            },
            select: {
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
          });
    const platformOrganization =
      organizationMembership ||
      locationMembership ||
      input.session.platformRole !== "PLATFORM_ADMIN"
        ? null
        : await prisma.organizations.findFirst({
            where: {
              status: {
                in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"],
              },
            },
            orderBy: {
              created_at: "asc",
            },
            select: {
              slug: true,
              locations: {
                where: {
                  is_active: true,
                },
                orderBy: {
                  created_at: "asc",
                },
                take: 1,
                select: {
                  slug: true,
                },
              },
            },
          });

    if (organizationMembership) {
      organizationSlug =
        organizationMembership.organizations.slug;
      locationSlug ??=
        organizationMembership.organizations.locations[0]?.slug;
    } else if (locationMembership) {
      organizationSlug =
        locationMembership.locations.organizations.slug;
      locationSlug ??= locationMembership.locations.slug;
    } else if (platformOrganization) {
      organizationSlug = platformOrganization.slug;
      locationSlug ??= platformOrganization.locations[0]?.slug;
    }
  }

  if (!organizationSlug) {
    throw new AppError(
      "NOT_FOUND",
      "目前沒有可管理的商家。",
      404,
    );
  }

  const context = await resolveOrganizationContext({
    session: input.session,
    organizationSlug,
    locationSlug,
  });

  if (!context.location && context.accessibleLocationIds.size > 0) {
    const firstLocation = await prisma.locations.findFirst({
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
        slug: true,
      },
    });
    if (firstLocation) {
      return resolveOrganizationContext({
        session: input.session,
        organizationSlug,
        locationSlug: firstLocation.slug,
      });
    }
  }

  return context;
}
