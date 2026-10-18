import "server-only";

import type { ApplicationSession } from "../auth/session";
import { resolveOrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import {
  getMerchantWorkspaceData,
  type MerchantWorkspaceData,
} from "../merchant/data";

export type StaffWorkspaceData = Pick<
  MerchantWorkspaceData,
  "session" | "organization" | "location" | "calendarDays" | "bookings"
>;

export async function getStaffWorkspaceData(input: {
  session: ApplicationSession;
  locationSlug: string;
}): Promise<StaffWorkspaceData> {
  const membership = await prisma.location_memberships.findFirst({
    where: {
      profile_id: input.session.profileId,
      role: "SERVICE_PROVIDER",
      status: "ACTIVE",
      locations: {
        slug: input.locationSlug,
        is_active: true,
        organizations: {
          status: {
            in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"],
          },
        },
      },
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

  if (!membership) {
    throw new AppError("NOT_FOUND", "找不到指定頁面。", 404);
  }

  const context = await resolveOrganizationContext({
    session: input.session,
    organizationSlug: membership.locations.organizations.slug,
    locationSlug: membership.locations.slug,
  });
  if (!context.linkedStaffProfileId) {
    throw new AppError(
      "FORBIDDEN",
      "此帳號尚未連結服務人員資料。",
      403,
    );
  }

  const data = await getMerchantWorkspaceData(context);
  return {
    session: data.session,
    organization: data.organization,
    location: data.location,
    calendarDays: data.calendarDays,
    bookings: data.bookings,
  };
}
