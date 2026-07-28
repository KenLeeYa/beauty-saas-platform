import "server-only";

import type { ApplicationSession } from "../auth/session";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

export type PlatformOverviewData = {
  session: {
    displayName: string;
    email: string;
  };
  stats: {
    organizations: number;
    activeOrganizations: number;
    locations: number;
    bookings: number;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    locationCount: number;
    memberCount: number;
    bookingCount: number;
    planName: string | null;
    subscriptionStatus: string | null;
    createdAt: string;
  }>;
};

export async function getPlatformOverviewData(
  session: ApplicationSession,
): Promise<PlatformOverviewData> {
  if (session.platformRole !== "PLATFORM_ADMIN") {
    throw new AppError("NOT_FOUND", "找不到指定頁面。", 404);
  }

  const [
    organizations,
    locationCount,
    bookingCount,
    bookingCountsByOrganization,
  ] =
    await Promise.all([
      prisma.organizations.findMany({
        orderBy: {
          created_at: "desc",
        },
        take: 100,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          created_at: true,
          _count: {
            select: {
              locations: true,
              organization_memberships: true,
            },
          },
          subscriptions: {
            where: {
              is_current: true,
            },
            take: 1,
            select: {
              status: true,
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
        },
      }),
      prisma.locations.count({
        where: {
          is_active: true,
        },
      }),
      prisma.bookings.count(),
      prisma.bookings.groupBy({
        by: ["organization_id"],
        _count: {
          _all: true,
        },
      }),
    ]);
  const bookingCountMap = new Map(
    bookingCountsByOrganization.map((item) => [
      item.organization_id,
      item._count._all,
    ]),
  );

  return {
    session: {
      displayName: session.displayName,
      email: session.email,
    },
    stats: {
      organizations: organizations.length,
      activeOrganizations: organizations.filter((organization) =>
        ["TRIALING", "ACTIVE", "GRACE_PERIOD"].includes(
          organization.status,
        ),
      ).length,
      locations: locationCount,
      bookings: bookingCount,
    },
    organizations: organizations.map((organization) => {
      const subscription = organization.subscriptions[0];
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        locationCount: organization._count.locations,
        memberCount: organization._count.organization_memberships,
        bookingCount: bookingCountMap.get(organization.id) ?? 0,
        planName:
          subscription?.plan_versions.plans.display_name ?? null,
        subscriptionStatus: subscription?.status ?? null,
        createdAt: organization.created_at.toISOString(),
      };
    }),
  };
}
