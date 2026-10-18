import "server-only";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import type { ApplicationSession } from "../auth/session";
import {
  hasCapability,
  isRole,
  type Capability,
  type Role,
} from "./capabilities";

export type OrganizationContext = {
  session: ApplicationSession;
  organization: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  location: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  } | null;
  roles: ReadonlySet<Role>;
  allLocations: boolean;
  accessibleLocationIds: ReadonlySet<string>;
  linkedStaffProfileId: string | null;
};

export async function resolveOrganizationContext(input: {
  session: ApplicationSession;
  organizationSlug: string;
  locationSlug?: string;
}): Promise<OrganizationContext> {
  const organization = await prisma.organizations.findUnique({
    where: {
      slug: input.organizationSlug,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      organization_memberships: {
        where: {
          profile_id: input.session.profileId,
          status: "ACTIVE",
        },
        select: {
          role: true,
          all_locations: true,
        },
      },
      locations: {
        where: {
          is_active: true,
          ...(input.locationSlug ? { slug: input.locationSlug } : {}),
        },
        select: {
          id: true,
          slug: true,
          name: true,
          timezone: true,
          location_memberships: {
            where: {
              profile_id: input.session.profileId,
              status: "ACTIVE",
            },
            select: {
              role: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      },
      staff_profiles: {
        where: {
          linked_profile_id: input.session.profileId,
          is_active: true,
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!organization) {
    throw new AppError("NOT_FOUND", "找不到指定資源。", 404);
  }

  const platformAdmin = input.session.platformRole === "PLATFORM_ADMIN";
  const organizationRoles = organization.organization_memberships
    .map((membership) => membership.role)
    .filter(isRole);
  const allLocations =
    platformAdmin ||
    organization.organization_memberships.some(
      (membership) => membership.all_locations,
    );

  const accessibleLocationIds = new Set(
    organization.locations
      .filter(
        (location) =>
          allLocations || location.location_memberships.length > 0,
      )
      .map((location) => location.id),
  );

  if (
    !platformAdmin &&
    organizationRoles.length === 0 &&
    accessibleLocationIds.size === 0
  ) {
    throw new AppError("NOT_FOUND", "找不到指定資源。", 404);
  }

  const selectedLocation = input.locationSlug
    ? organization.locations.find(
        (location) => location.slug === input.locationSlug,
      )
    : null;

  if (
    input.locationSlug &&
    (!selectedLocation || !accessibleLocationIds.has(selectedLocation.id))
  ) {
    throw new AppError("NOT_FOUND", "找不到指定資源。", 404);
  }

  const resolvedRoles = new Set<Role>(organizationRoles);
  if (platformAdmin) {
    resolvedRoles.add("PLATFORM_ADMIN");
  }
  if (selectedLocation) {
    for (const membership of selectedLocation.location_memberships) {
      if (isRole(membership.role)) {
        resolvedRoles.add(membership.role);
      }
    }
  }

  return {
    session: input.session,
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      status: organization.status,
    },
    location: selectedLocation
      ? {
          id: selectedLocation.id,
          slug: selectedLocation.slug,
          name: selectedLocation.name,
          timezone: selectedLocation.timezone,
        }
      : null,
    roles: resolvedRoles,
    allLocations,
    accessibleLocationIds,
    linkedStaffProfileId: organization.staff_profiles[0]?.id ?? null,
  };
}

export function assertCapability(
  context: OrganizationContext,
  capability: Capability,
): void {
  if (!hasCapability(context.roles, capability)) {
    throw new AppError("FORBIDDEN", "你的角色沒有此操作權限。", 403);
  }
}

export function requireLocation(
  context: OrganizationContext,
): NonNullable<OrganizationContext["location"]> {
  if (!context.location) {
    throw new AppError("BAD_REQUEST", "此操作需要指定分店。", 400);
  }
  return context.location;
}
