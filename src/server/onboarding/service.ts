import "server-only";

import {
  Prisma,
  type merchant_application_status,
} from "@prisma/client";

import type { ApplicationSession } from "../auth/session";
import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import type {
  AdminMerchantApplicationReviewInput,
  MerchantApplicationFormInput,
} from "./schemas";
import {
  canTransitionMerchantApplication,
  isApplicantEditableStatus,
  isTerminalApplicationStatus,
  type MerchantApplicationStatus,
} from "./state-machine";

const applicationResultSelect = {
  id: true,
  status: true,
  version: true,
  approved_organization_id: true,
} as const;

function assertTransition(
  current: merchant_application_status,
  next: MerchantApplicationStatus,
): void {
  if (
    !canTransitionMerchantApplication(
      current as MerchantApplicationStatus,
      next,
    )
  ) {
    throw new AppError(
      "CONFLICT",
      `商家申請無法由 ${current} 變更為 ${next}。`,
      409,
    );
  }
}

export async function saveMerchantApplication(input: {
  session: ApplicationSession;
  payload: MerchantApplicationFormInput;
  requestId: string;
}): Promise<{
  id: string;
  status: string;
  version: number;
}> {
  return prisma.$transaction(
    async (transaction) => {
      const latest = await transaction.merchant_applications.findFirst({
        where: {
          applicant_profile_id: input.session.profileId,
        },
        orderBy: {
          created_at: "desc",
        },
        select: {
          id: true,
          status: true,
          version: true,
        },
      });

      const shouldCreate =
        !latest ||
        isTerminalApplicationStatus(
          latest.status as MerchantApplicationStatus,
        );
      const nextStatus = input.payload.submit ? "SUBMITTED" : "DRAFT";
      const now = new Date();

      if (shouldCreate) {
        const created = await transaction.merchant_applications.create({
          data: {
            applicant_profile_id: input.session.profileId,
            status: nextStatus,
            business_name: input.payload.businessName,
            contact_name: input.payload.contactName,
            contact_email: input.payload.contactEmail
              .trim()
              .toLowerCase(),
            contact_phone: input.payload.contactPhone,
            industry_type: input.payload.industryType,
            desired_slug: input.payload.desiredSlug,
            initial_location_name: input.payload.initialLocationName,
            initial_location_address:
              input.payload.initialLocationAddress,
            applicant_note: input.payload.applicantNote || null,
            submitted_at: input.payload.submit ? now : null,
            version: 1,
            merchant_application_events: {
              create: {
                previous_status: null,
                new_status: nextStatus,
                actor_profile_id: input.session.profileId,
                reason: input.payload.submit ? "申請人送出審核" : "建立草稿",
                metadata: {
                  requestId: input.requestId,
                },
              },
            },
          },
          select: applicationResultSelect,
        });

        await transaction.audit_logs.create({
          data: {
            actor_profile_id: input.session.profileId,
            action: input.payload.submit
              ? "MERCHANT_APPLICATION_SUBMIT"
              : "MERCHANT_APPLICATION_DRAFT_CREATE",
            target_type: "MERCHANT_APPLICATION",
            target_id: created.id,
            outcome: "SUCCESS",
            request_id: input.requestId,
            after_json: {
              status: created.status,
              desiredSlug: input.payload.desiredSlug,
            },
          },
        });
        return created;
      }

      if (
        !isApplicantEditableStatus(
          latest.status as MerchantApplicationStatus,
        )
      ) {
        throw new AppError(
          "CONFLICT",
          "此申請目前正在審核，無法修改。",
          409,
        );
      }
      if (input.payload.expectedVersion !== latest.version) {
        throw new AppError(
          "CONFLICT",
          "申請資料已更新，請重新整理後再試。",
          409,
        );
      }

      const next = input.payload.submit ? "SUBMITTED" : latest.status;
      if (input.payload.submit) {
        assertTransition(latest.status, next);
      }
      const updated = await transaction.merchant_applications.updateMany({
        where: {
          id: latest.id,
          applicant_profile_id: input.session.profileId,
          status: latest.status,
          version: latest.version,
        },
        data: {
          status: next,
          business_name: input.payload.businessName,
          contact_name: input.payload.contactName,
          contact_email: input.payload.contactEmail.trim().toLowerCase(),
          contact_phone: input.payload.contactPhone,
          industry_type: input.payload.industryType,
          desired_slug: input.payload.desiredSlug,
          initial_location_name: input.payload.initialLocationName,
          initial_location_address: input.payload.initialLocationAddress,
          applicant_note: input.payload.applicantNote || null,
          submitted_at: input.payload.submit ? now : undefined,
          review_started_at: input.payload.submit ? null : undefined,
          reviewed_at: input.payload.submit ? null : undefined,
          reviewer_profile_id: input.payload.submit ? null : undefined,
          rejection_reason: input.payload.submit ? null : undefined,
          version: {
            increment: 1,
          },
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "申請資料已被其他人更新，請重新整理。",
          409,
        );
      }

      if (input.payload.submit) {
        await transaction.merchant_application_events.create({
          data: {
            application_id: latest.id,
            previous_status: latest.status,
            new_status: "SUBMITTED",
            actor_profile_id: input.session.profileId,
            reason: "申請人送出審核",
            metadata: {
              requestId: input.requestId,
            },
          },
        });
      }
      await transaction.audit_logs.create({
        data: {
          actor_profile_id: input.session.profileId,
          action: input.payload.submit
            ? "MERCHANT_APPLICATION_SUBMIT"
            : "MERCHANT_APPLICATION_UPDATE",
          target_type: "MERCHANT_APPLICATION",
          target_id: latest.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            status: next,
            desiredSlug: input.payload.desiredSlug,
          },
        },
      });

      return transaction.merchant_applications.findUniqueOrThrow({
        where: {
          id: latest.id,
        },
        select: applicationResultSelect,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}

function reviewTarget(
  action: AdminMerchantApplicationReviewInput["action"],
): MerchantApplicationStatus {
  switch (action) {
    case "START_REVIEW":
      return "PENDING_REVIEW";
    case "REQUEST_INFO":
      return "NEEDS_INFO";
    case "APPROVE":
      return "APPROVED";
    case "REJECT":
      return "REJECTED";
  }
}

function dateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function reviewMerchantApplication(input: {
  session: ApplicationSession;
  applicationId: string;
  payload: AdminMerchantApplicationReviewInput;
  requestId: string;
}): Promise<{
  id: string;
  status: string;
  version: number;
  organizationId: string | null;
}> {
  if (input.session.platformRole !== "PLATFORM_ADMIN") {
    throw new AppError("NOT_FOUND", "找不到指定資源。", 404);
  }

  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`
          select id
          from public.merchant_applications
          where id = ${input.applicationId}::uuid
          for update
        `,
      );
      const application =
        await transaction.merchant_applications.findUnique({
          where: {
            id: input.applicationId,
          },
        });
      if (!application) {
        throw new AppError("NOT_FOUND", "找不到商家申請。", 404);
      }
      if (application.version !== input.payload.expectedVersion) {
        throw new AppError(
          "CONFLICT",
          "申請已被其他管理員更新，請重新整理。",
          409,
        );
      }

      const target = reviewTarget(input.payload.action);
      assertTransition(application.status, target);
      const now = new Date();
      let organizationId = application.approved_organization_id;

      if (input.payload.action === "APPROVE") {
        if (!application.desired_slug) {
          throw new AppError(
            "BAD_REQUEST",
            "申請缺少商家網址，請先要求補件。",
            400,
          );
        }
        const slugInUse = await transaction.organizations.findUnique({
          where: {
            slug: application.desired_slug,
          },
          select: {
            id: true,
          },
        });
        if (slugInUse) {
          throw new AppError(
            "CONFLICT",
            "商家網址已被使用，請要求申請人更換。",
            409,
          );
        }

        const trialPlanVersion = await transaction.plan_versions.findFirst({
          where: {
            retired_at: null,
            effective_at: {
              lte: now,
            },
            plans: {
              code: "TRIAL",
              is_active: true,
            },
          },
          orderBy: {
            version: "desc",
          },
          select: {
            id: true,
            trial_days: true,
          },
        });
        if (!trialPlanVersion) {
          throw new AppError(
            "INTERNAL_ERROR",
            "目前沒有可用的試用方案版本。",
            500,
          );
        }

        const trialEndsAt = new Date(
          now.getTime() + trialPlanVersion.trial_days * 86_400_000,
        );
        const periodStart = dateOnly(now);
        const periodEnd = new Date(
          periodStart.getTime() +
            Math.max(0, trialPlanVersion.trial_days - 1) * 86_400_000,
        );
        const organization = await transaction.organizations.create({
          data: {
            name: application.business_name,
            slug: application.desired_slug,
            business_name: application.business_name,
            email: application.contact_email,
            phone: application.contact_phone,
            status: "TRIALING",
            trial_ends_at: trialEndsAt,
            public_profile_enabled: false,
            is_test: getServerEnv().APP_ENV !== "production",
            locations: {
              create: {
                name: application.initial_location_name,
                slug: "main",
                code: "MAIN",
                address: application.initial_location_address,
                phone: application.contact_phone,
                timezone: "Asia/Taipei",
                currency: "TWD",
                booking_state: "CLOSED",
                online_booking_enabled: false,
                is_active: true,
              },
            },
            organization_memberships: {
              create: {
                profile_id: application.applicant_profile_id,
                role: "ORGANIZATION_OWNER",
                status: "ACTIVE",
                all_locations: true,
                is_primary_owner: true,
                joined_at: now,
              },
            },
            subscriptions: {
              create: {
                plan_version_id: trialPlanVersion.id,
                status: "TRIALING",
                is_current: true,
                billing_period_start: periodStart,
                billing_period_end: periodEnd,
                trial_ends_at: trialEndsAt,
              },
            },
            merchant_setup_progress: {
              create: {
                brand_completed_at: now,
                location_completed_at: now,
                last_step: "BUSINESS_HOURS",
              },
            },
          },
          select: {
            id: true,
          },
        });
        organizationId = organization.id;

        await transaction.billing_notifications.create({
          data: {
            organization_id: organization.id,
            notification_type: "TRIAL_STARTED",
            level: "INFO",
            title: "14 天試用已開始",
            message:
              "完成開店設定與測試預約後，才會開放公開預約連結。",
            expires_at: trialEndsAt,
          },
        });
      }

      const updated = await transaction.merchant_applications.updateMany({
        where: {
          id: application.id,
          status: application.status,
          version: application.version,
        },
        data: {
          status: target,
          review_started_at:
            input.payload.action === "START_REVIEW"
              ? now
              : application.review_started_at,
          reviewed_at: ["APPROVE", "REJECT"].includes(
            input.payload.action,
          )
            ? now
            : null,
          reviewer_profile_id: input.session.profileId,
          approved_organization_id: organizationId,
          rejection_reason:
            input.payload.action === "REJECT"
              ? input.payload.reason
              : null,
          internal_note:
            input.payload.action === "REQUEST_INFO"
              ? input.payload.reason
              : application.internal_note,
          version: {
            increment: 1,
          },
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "申請已被其他管理員更新，請重新整理。",
          409,
        );
      }

      await transaction.merchant_application_events.create({
        data: {
          application_id: application.id,
          previous_status: application.status,
          new_status: target,
          actor_profile_id: input.session.profileId,
          reason: input.payload.reason || null,
          metadata: {
            requestId: input.requestId,
            organizationId,
          },
        },
      });
      await transaction.audit_logs.create({
        data: {
          organization_id: organizationId,
          actor_profile_id: input.session.profileId,
          action: `MERCHANT_APPLICATION_${input.payload.action}`,
          target_type: "MERCHANT_APPLICATION",
          target_id: application.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            status: target,
            organizationId,
          },
        },
      });

      const result =
        await transaction.merchant_applications.findUniqueOrThrow({
          where: {
            id: application.id,
          },
          select: applicationResultSelect,
        });
      return {
        id: result.id,
        status: result.status,
        version: result.version,
        organizationId: result.approved_organization_id,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
}
