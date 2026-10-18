import "server-only";

import { prisma } from "../database/prisma";

const AVAILABLE_ORGANIZATION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
] as const;

export type LocationSelection = {
  id: string;
  name: string;
  slug: string;
  role: string;
  destination: string;
};

export type OrganizationSelection = {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
  destination: string;
  locations: LocationSelection[];
};

function locationDestination(input: {
  organizationSlug: string;
  locationSlug: string;
  role: string;
}): string {
  if (input.role === "SERVICE_PROVIDER") {
    return `/staff/${encodeURIComponent(input.locationSlug)}`;
  }

  return `/merchant/dashboard?organization=${encodeURIComponent(
    input.organizationSlug,
  )}&location=${encodeURIComponent(input.locationSlug)}`;
}

export async function getSessionOrganizationSelections(
  profileId: string,
): Promise<OrganizationSelection[]> {
  const [organizationMemberships, locationMemberships] = await Promise.all([
    prisma.organization_memberships.findMany({
      where: {
        profile_id: profileId,
        status: "ACTIVE",
        organizations: {
          status: {
            in: [...AVAILABLE_ORGANIZATION_STATUSES],
          },
        },
      },
      orderBy: {
        created_at: "asc",
      },
      select: {
        role: true,
        all_locations: true,
        is_primary_owner: true,
        organizations: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            locations: {
              where: {
                is_active: true,
              },
              orderBy: {
                created_at: "asc",
              },
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            merchant_setup_progress: {
              select: {
                go_live_at: true,
              },
            },
          },
        },
      },
    }),
    prisma.location_memberships.findMany({
      where: {
        profile_id: profileId,
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
      orderBy: {
        created_at: "asc",
      },
      select: {
        role: true,
        locations: {
          select: {
            id: true,
            name: true,
            slug: true,
            organization_id: true,
            organizations: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const locationsByOrganization = new Map<
    string,
    Array<(typeof locationMemberships)[number]>
  >();
  for (const membership of locationMemberships) {
    const organizationId = membership.locations.organization_id;
    const memberships = locationsByOrganization.get(organizationId) ?? [];
    memberships.push(membership);
    locationsByOrganization.set(organizationId, memberships);
  }

  const selections = new Map<string, OrganizationSelection>();
  for (const membership of organizationMemberships) {
    const organization = membership.organizations;
    const explicitLocations =
      locationsByOrganization.get(organization.id) ?? [];
    const allowedLocations = membership.all_locations
      ? organization.locations.map((location) => ({
          ...location,
          role: membership.role,
        }))
      : explicitLocations.map((item) => ({
          id: item.locations.id,
          name: item.locations.name,
          slug: item.locations.slug,
          role: item.role,
        }));
    const locations = allowedLocations.map((location) => ({
      ...location,
      destination: locationDestination({
        organizationSlug: organization.slug,
        locationSlug: location.slug,
        role: location.role,
      }),
    }));
    const primaryLocation = locations[0];
    const needsSetup =
      membership.role === "ORGANIZATION_OWNER" &&
      membership.is_primary_owner &&
      organization.merchant_setup_progress !== null &&
      organization.merchant_setup_progress.go_live_at === null;
    const destination = needsSetup
      ? primaryLocation
        ? `/merchant/setup?organization=${encodeURIComponent(
            organization.slug,
          )}&location=${encodeURIComponent(primaryLocation.slug)}`
        : `/merchant/locations?organization=${encodeURIComponent(
            organization.slug,
          )}`
      : membership.role === "FINANCE_VIEWER"
        ? `/merchant/reports?organization=${encodeURIComponent(
            organization.slug,
          )}`
        : locations.length === 1
          ? locations[0].destination
          : locations.length > 1
            ? `/select-location?organization=${encodeURIComponent(
                organization.slug,
              )}`
            : `/merchant/locations?organization=${encodeURIComponent(
                organization.slug,
              )}`;

    selections.set(organization.id, {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      role: membership.role,
      destination,
      locations,
    });
  }

  for (const membership of locationMemberships) {
    const location = membership.locations;
    const organization = location.organizations;
    const existing = selections.get(organization.id);
    if (existing) {
      if (
        !existing.locations.some(
          (candidate) => candidate.id === location.id,
        )
      ) {
        existing.locations.push({
          id: location.id,
          name: location.name,
          slug: location.slug,
          role: membership.role,
          destination: locationDestination({
            organizationSlug: organization.slug,
            locationSlug: location.slug,
            role: membership.role,
          }),
        });
      }
      continue;
    }

    const locationSelection = {
      id: location.id,
      name: location.name,
      slug: location.slug,
      role: membership.role,
      destination: locationDestination({
        organizationSlug: organization.slug,
        locationSlug: location.slug,
        role: membership.role,
      }),
    };
    selections.set(organization.id, {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      role: membership.role,
      destination: locationSelection.destination,
      locations: [locationSelection],
    });
  }

  return [...selections.values()];
}
