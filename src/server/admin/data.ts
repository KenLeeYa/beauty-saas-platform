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

export type PlatformOrganizationDetailData = {
  organization: {
    id: string;
    name: string;
    slug: string;
    businessName: string;
    email: string;
    phone: string;
    status: string;
    publicProfileEnabled: boolean;
    trialEndsAt: string | null;
    createdAt: string;
  };
  subscription: {
    status: string;
    planName: string;
    planVersion: number;
    currentPeriodEnd: string;
  } | null;
  locations: Array<{
    id: string;
    name: string;
    slug: string;
    bookingState: string;
    onlineBookingEnabled: boolean;
    timezone: string;
  }>;
  members: Array<{
    id: string;
    displayName: string;
    email: string;
    role: string;
    isPrimaryOwner: boolean;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalMinor: number;
    currency: string;
    dueAt: string | null;
  }>;
};

function requirePlatformAdmin(session: ApplicationSession): void {
  if (session.platformRole !== "PLATFORM_ADMIN") {
    throw new AppError("NOT_FOUND", "找不到指定頁面。", 404);
  }
}

export async function getPlatformOverviewData(
  session: ApplicationSession,
): Promise<PlatformOverviewData> {
  requirePlatformAdmin(session);

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

export async function getPlatformOrganizationDetail(
  session: ApplicationSession,
  organizationId: string,
): Promise<PlatformOrganizationDetailData> {
  requirePlatformAdmin(session);
  const organization = await prisma.organizations.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      business_name: true,
      email: true,
      phone: true,
      status: true,
      public_profile_enabled: true,
      trial_ends_at: true,
      created_at: true,
      locations: {
        orderBy: {
          created_at: "asc",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          booking_state: true,
          online_booking_enabled: true,
          timezone: true,
        },
      },
      organization_memberships: {
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          created_at: "asc",
        },
        select: {
          id: true,
          role: true,
          is_primary_owner: true,
          profiles: {
            select: {
              display_name: true,
              email: true,
            },
          },
        },
      },
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
              version: true,
              plans: {
                select: {
                  display_name: true,
                },
              },
            },
          },
        },
      },
      invoices: {
        orderBy: {
          issued_at: "desc",
        },
        take: 10,
        select: {
          id: true,
          invoice_number: true,
          status: true,
          total_minor: true,
          currency: true,
          due_at: true,
        },
      },
    },
  });
  if (!organization) {
    throw new AppError("NOT_FOUND", "找不到商家資料。", 404);
  }

  const subscription = organization.subscriptions[0];
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      businessName: organization.business_name,
      email: organization.email,
      phone: organization.phone,
      status: organization.status,
      publicProfileEnabled: organization.public_profile_enabled,
      trialEndsAt: organization.trial_ends_at?.toISOString() ?? null,
      createdAt: organization.created_at.toISOString(),
    },
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.plan_versions.plans.display_name,
          planVersion: subscription.plan_versions.version,
          currentPeriodEnd:
            subscription.billing_period_end.toISOString(),
        }
      : null,
    locations: organization.locations.map((location) => ({
      id: location.id,
      name: location.name,
      slug: location.slug,
      bookingState: location.booking_state,
      onlineBookingEnabled: location.online_booking_enabled,
      timezone: location.timezone,
    })),
    members: organization.organization_memberships.map((membership) => ({
      id: membership.id,
      displayName: membership.profiles.display_name,
      email: membership.profiles.email,
      role: membership.role,
      isPrimaryOwner: membership.is_primary_owner,
    })),
    invoices: organization.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.invoice_number,
      status: invoice.status,
      totalMinor: invoice.total_minor,
      currency: invoice.currency,
      dueAt: invoice.due_at?.toISOString() ?? null,
    })),
  };
}
