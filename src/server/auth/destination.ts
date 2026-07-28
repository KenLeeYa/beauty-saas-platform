import "server-only";

import { prisma } from "../database/prisma";
import { getSessionOrganizationSelections } from "./selection";

export async function resolveSessionDestination(input: {
  profileId: string;
  platformRole: string | null;
}): Promise<string> {
  if (input.platformRole === "PLATFORM_ADMIN") {
    return "/admin/organizations";
  }

  const selections = await getSessionOrganizationSelections(input.profileId);
  if (selections.length > 1) {
    return "/select-organization";
  }
  if (selections.length === 1) {
    return selections[0].destination;
  }

  const merchantApplication =
    await prisma.merchant_applications.findFirst({
      where: {
        applicant_profile_id: input.profileId,
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        status: true,
      },
    });
  if (merchantApplication) {
    return ["DRAFT", "NEEDS_INFO"].includes(merchantApplication.status)
      ? "/onboarding/edit"
      : "/onboarding/status";
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
