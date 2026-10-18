import "server-only";

import { hasCapability } from "../../../server/authorization/capabilities";
import {
  requireLocation,
  type OrganizationContext,
} from "../../../server/authorization/context";
import { prisma } from "../../../server/database/prisma";
import { AppError } from "../../../server/http/errors";

export async function retryMerchantNotification(input: {
  context: OrganizationContext;
  deliveryId: string;
  requestId: string;
  now?: Date;
}): Promise<{
  jobId: string;
  status: "PENDING";
  nextAttemptAt: string;
}> {
  if (
    !hasCapability(input.context.roles, "organization.manage") &&
    !hasCapability(input.context.roles, "booking.manage")
  ) {
    throw new AppError("FORBIDDEN", "你的角色沒有通知重試權限。", 403);
  }
  const location = requireLocation(input.context);
  const now = input.now ?? new Date();

  return prisma.$transaction(async (transaction) => {
    const delivery = await transaction.notification_deliveries.findFirst({
      where: {
        id: input.deliveryId,
        organization_id: input.context.organization.id,
        notification_jobs: {
          notification_outbox: {
            location_id: location.id,
          },
        },
      },
      select: {
        notification_job_id: true,
        notification_jobs: {
          select: {
            status: true,
            attempt_count: true,
          },
        },
      },
    });
    if (!delivery) {
      throw new AppError("NOT_FOUND", "找不到通知紀錄。", 404);
    }
    if (!["FAILED", "DEAD_LETTER"].includes(delivery.notification_jobs.status)) {
      throw new AppError("CONFLICT", "此通知目前不需要重試。", 409);
    }

    const updated = await transaction.notification_jobs.updateMany({
      where: {
        id: delivery.notification_job_id,
        organization_id: input.context.organization.id,
        status: delivery.notification_jobs.status,
      },
      data: {
        status: "PENDING",
        attempt_count:
          delivery.notification_jobs.status === "DEAD_LETTER"
            ? 0
            : delivery.notification_jobs.attempt_count,
        next_attempt_at: now,
        completed_at: null,
        locked_at: null,
        locked_by: null,
      },
    });
    if (updated.count !== 1) {
      throw new AppError("CONFLICT", "通知狀態已變更，請重新整理。", 409);
    }

    await transaction.audit_logs.create({
      data: {
        organization_id: input.context.organization.id,
        location_id: location.id,
        actor_profile_id: input.context.session.profileId,
        action: "NOTIFICATION_RETRY_REQUESTED",
        target_type: "NOTIFICATION_JOB",
        target_id: delivery.notification_job_id,
        outcome: "SUCCESS",
        request_id: input.requestId,
        after_json: {
          deliveryId: input.deliveryId,
          previousStatus: delivery.notification_jobs.status,
          nextAttemptAt: now.toISOString(),
        },
      },
    });

    return {
      jobId: delivery.notification_job_id,
      status: "PENDING",
      nextAttemptAt: now.toISOString(),
    };
  });
}
