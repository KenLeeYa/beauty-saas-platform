import "server-only";

import type { ApplicationSession } from "../auth/session";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

export type MerchantApplicationView = {
  id: string;
  status: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  industryType: string;
  desiredSlug: string;
  initialLocationName: string;
  initialLocationAddress: string;
  applicantNote: string;
  rejectionReason: string | null;
  version: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedOrganization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  events: Array<{
    id: string;
    previousStatus: string | null;
    newStatus: string;
    reason: string | null;
    createdAt: string;
  }>;
};

export type ApplicantOnboardingData = {
  session: {
    displayName: string;
    email: string;
  };
  application: MerchantApplicationView | null;
};

const applicationSelect = {
  id: true,
  status: true,
  business_name: true,
  contact_name: true,
  contact_email: true,
  contact_phone: true,
  industry_type: true,
  desired_slug: true,
  initial_location_name: true,
  initial_location_address: true,
  applicant_note: true,
  rejection_reason: true,
  version: true,
  submitted_at: true,
  reviewed_at: true,
  organizations: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  merchant_application_events: {
    orderBy: {
      created_at: "desc" as const,
    },
    take: 20,
    select: {
      id: true,
      previous_status: true,
      new_status: true,
      reason: true,
      created_at: true,
    },
  },
} as const;

function toApplicationView(
  application: Awaited<
    ReturnType<typeof findApplicantApplication>
  >,
): MerchantApplicationView | null {
  if (!application) {
    return null;
  }

  return {
    id: application.id,
    status: application.status,
    businessName: application.business_name,
    contactName: application.contact_name,
    contactEmail: application.contact_email,
    contactPhone: application.contact_phone,
    industryType: application.industry_type,
    desiredSlug: application.desired_slug ?? "",
    initialLocationName: application.initial_location_name,
    initialLocationAddress: application.initial_location_address,
    applicantNote: application.applicant_note ?? "",
    rejectionReason: application.rejection_reason,
    version: application.version,
    submittedAt: application.submitted_at?.toISOString() ?? null,
    reviewedAt: application.reviewed_at?.toISOString() ?? null,
    approvedOrganization: application.organizations,
    events: application.merchant_application_events.map((event) => ({
      id: event.id,
      previousStatus: event.previous_status,
      newStatus: event.new_status,
      reason: event.reason,
      createdAt: event.created_at.toISOString(),
    })),
  };
}

async function findApplicantApplication(profileId: string) {
  return prisma.merchant_applications.findFirst({
    where: {
      applicant_profile_id: profileId,
    },
    orderBy: {
      created_at: "desc",
    },
    select: applicationSelect,
  });
}

export async function getApplicantOnboardingData(
  session: ApplicationSession,
): Promise<ApplicantOnboardingData> {
  return {
    session: {
      displayName: session.displayName,
      email: session.email,
    },
    application: toApplicationView(
      await findApplicantApplication(session.profileId),
    ),
  };
}

export type AdminMerchantApplicationData = {
  applications: Array<
    MerchantApplicationView & {
      applicant: {
        displayName: string;
        email: string;
      };
      internalNote: string | null;
      createdAt: string;
    }
  >;
};

export async function getAdminMerchantApplications(
  session: ApplicationSession,
): Promise<AdminMerchantApplicationData> {
  if (session.platformRole !== "PLATFORM_ADMIN") {
    throw new AppError("NOT_FOUND", "找不到指定頁面。", 404);
  }

  const applications = await prisma.merchant_applications.findMany({
    orderBy: {
      created_at: "desc",
    },
    take: 100,
    select: {
      ...applicationSelect,
      internal_note: true,
      created_at: true,
      profiles_merchant_applications_applicant_profile_idToprofiles: {
        select: {
          display_name: true,
          email: true,
        },
      },
    },
  });

  return {
    applications: applications.map((application) => {
      const view = toApplicationView(application);
      if (!view) {
        throw new AppError(
          "INTERNAL_ERROR",
          "商家申請資料轉換失敗。",
          500,
        );
      }
      const applicant =
        application.profiles_merchant_applications_applicant_profile_idToprofiles;
      return {
        ...view,
        applicant: {
          displayName: applicant.display_name,
          email: applicant.email,
        },
        internalNote: application.internal_note,
        createdAt: application.created_at.toISOString(),
      };
    }),
  };
}
