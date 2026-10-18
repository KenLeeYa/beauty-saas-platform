import "server-only";

import type {
  notification_channel,
  notification_event_type,
  Prisma,
} from "@prisma/client";

import { prisma } from "../database/prisma";
import { getNotificationAdapterForLocation } from "./adapters";
import {
  renderNotification,
  retryDelayMilliseconds,
  selectNotificationRecipient,
} from "./presentation";

const OUTBOX_BATCH_SIZE = 50;
const DELIVERY_BATCH_SIZE = 25;
const STALE_LOCK_MINUTES = 5;

const reminderSpecs: ReadonlyArray<{
  hours: number;
  eventType: notification_event_type;
}> = [
  {
    hours: 24,
    eventType: "BOOKING_REMINDER_24H",
  },
  {
    hours: 3,
    eventType: "BOOKING_REMINDER_3H",
  },
  {
    hours: 1,
    eventType: "BOOKING_REMINDER_1H",
  },
];

type NotificationCycleResult = {
  remindersEnqueued: number;
  outboxMaterialized: number;
  sent: number;
  disabled: number;
  failed: number;
  deadLettered: number;
  staleJobsReleased: number;
};

type DeliveryRecord = Awaited<
  ReturnType<typeof findOutboxForDelivery>
>[number];

function findOutboxForDelivery(limit = OUTBOX_BATCH_SIZE) {
  return prisma.notification_outbox.findMany({
    where: {
      dispatched_at: null,
      available_at: {
        lte: new Date(),
      },
    },
    orderBy: [
      {
        available_at: "asc",
      },
      {
        created_at: "asc",
      },
    ],
    take: limit,
    include: {
      organizations: {
        select: {
          name: true,
          notification_integrations: {
            select: {
              channel: true,
              status: true,
            },
          },
        },
      },
      locations: {
        select: {
          name: true,
          timezone: true,
        },
      },
      customers: {
        select: {
          display_name: true,
          contact_preference: true,
          customer_contacts: {
            select: {
              contact_type: true,
              normalized_value: true,
              is_primary: true,
            },
          },
          customer_contact_links: {
            where: {
              is_active: true,
              channel: "LINE",
            },
            orderBy: {
              linked_at: "desc",
            },
            take: 1,
            select: {
              provider_user_reference: true,
            },
          },
        },
      },
      bookings: {
        select: {
          booking_segments: {
            orderBy: {
              sort_order: "asc",
            },
            take: 1,
            select: {
              service_name_snapshot: true,
              starts_at: true,
            },
          },
        },
      },
    },
  });
}

function resolveRecipient(record: DeliveryRecord) {
  if (!record.customers) {
    return {
      channel: "EMAIL" as const,
      address: null,
    };
  }

  return selectNotificationRecipient({
    preference: record.customers.contact_preference,
    contacts: record.customers.customer_contacts.map((contact) => ({
      contactType: contact.contact_type,
      value: contact.normalized_value,
      primary: contact.is_primary,
    })),
    lineLinks: record.customers.customer_contact_links.map((link) => ({
      providerUserReference: link.provider_user_reference,
    })),
  });
}

function isIntegrationActive(
  record: DeliveryRecord,
  channel: notification_channel,
): boolean {
  return record.organizations.notification_integrations.some(
    (integration) =>
      integration.channel === channel &&
      integration.status === "ACTIVE",
  );
}

  async function disabledCode(input: {
  record: DeliveryRecord;
  channel: notification_channel;
  address: string | null;
  }): Promise<string | null> {
  if (!input.address) {
    return "NO_NOTIFICATION_RECIPIENT";
  }
  if (!isIntegrationActive(input.record, input.channel)) {
    return "NOTIFICATION_INTEGRATION_DISABLED";
  }

  const adapter = await getNotificationAdapterForLocation(input.channel,
    input.record.organization_id,input.record.location_id);
  return adapter.configured
    ? null
    : (adapter.unavailableCode ?? "NOTIFICATION_PROVIDER_DISABLED");
}

async function ensureProviderAlert(
  transaction: Prisma.TransactionClient,
  input: {
    record: DeliveryRecord;
    channel: notification_channel;
    errorCode: string;
  },
): Promise<void> {
  if (
    input.errorCode === "NO_NOTIFICATION_RECIPIENT" ||
    input.errorCode === "NOTIFICATION_INTEGRATION_DISABLED"
  ) {
    return;
  }

  const alertType = `NOTIFICATION_PROVIDER_${input.channel}`;
  const existing = await transaction.operational_alerts.findFirst({
    where: {
      organization_id: input.record.organization_id,
      location_id: input.record.location_id,
      alert_type: alertType,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return;
  }

  await transaction.operational_alerts.create({
    data: {
      organization_id: input.record.organization_id,
      location_id: input.record.location_id,
      alert_type: alertType,
      severity: "WARNING",
      message: `${input.channel} 通知供應商未完成設定或暫時無法使用。`,
      target_type: "NOTIFICATION_CHANNEL",
      target_id: input.channel,
    },
  });
}

export async function enqueueBookingReminders(
  now = new Date(),
): Promise<number> {
  let enqueued = 0;

  for (const spec of reminderSpecs) {
    const windowStart = new Date(
      now.getTime() + (spec.hours * 60 - 3) * 60_000,
    );
    const windowEnd = new Date(
      now.getTime() + (spec.hours * 60 + 4) * 60_000,
    );
    const segments = await prisma.booking_segments.findMany({
      where: {
        sort_order: 0,
        starts_at: {
          gte: windowStart,
          lt: windowEnd,
        },
        bookings: {
          is: {
            status: "CONFIRMED",
            is_test: false,
          },
        },
        locations: {
          is: {
            location_booking_policies: {
              is: {
                reminder_hours: {
                  has: spec.hours,
                },
              },
            },
          },
        },
      },
      select: {
        organization_id: true,
        location_id: true,
        booking_id: true,
        service_name_snapshot: true,
        starts_at: true,
        bookings: {
          select: {
            customer_id: true,
          },
        },
      },
    });

    if (segments.length === 0) {
      continue;
    }

    const result = await prisma.notification_outbox.createMany({
      data: segments
        .filter(
          (
            segment,
          ): segment is typeof segment & {
            booking_id: string;
            bookings: NonNullable<typeof segment.bookings>;
          } => Boolean(segment.booking_id && segment.bookings),
        )
        .map((segment) => ({
          organization_id: segment.organization_id,
          location_id: segment.location_id,
          booking_id: segment.booking_id,
          customer_id: segment.bookings.customer_id,
          event_type: spec.eventType,
          payload: {
            bookingId: segment.booking_id,
            serviceName: segment.service_name_snapshot,
            startsAt: segment.starts_at.toISOString(),
            reminderHours: spec.hours,
          },
          idempotency_key: `booking:${segment.booking_id}:reminder:${spec.hours}h`,
          available_at: now,
        })),
      skipDuplicates: true,
    });
    enqueued += result.count;
  }

  return enqueued;
}

export async function materializeNotificationJobs(): Promise<{
  materialized: number;
  disabled: number;
}> {
  const records = await findOutboxForDelivery();
  let materialized = 0;
  let disabled = 0;

  for (const record of records) {
    const recipient = resolveRecipient(record);
    const errorCode = await disabledCode({
      record,
      channel: recipient.channel,
      address: recipient.address,
    });

    await prisma.$transaction(async (transaction) => {
      const job = await transaction.notification_jobs.upsert({
        where: {
          outbox_id_channel: {
            outbox_id: record.id,
            channel: recipient.channel,
          },
        },
        update: {},
        create: {
          organization_id: record.organization_id,
          outbox_id: record.id,
          channel: recipient.channel,
          status: errorCode ? "CANCELLED" : "PENDING",
          completed_at: errorCode ? new Date() : null,
          last_error_code: errorCode,
        },
        select: {
          id: true,
        },
      });

      if (errorCode) {
        await transaction.notification_deliveries.upsert({
          where: {
            notification_job_id_attempt_number: {
              notification_job_id: job.id,
              attempt_number: 1,
            },
          },
          update: {},
          create: {
            organization_id: record.organization_id,
            notification_job_id: job.id,
            channel: recipient.channel,
            status:
              errorCode === "NO_NOTIFICATION_RECIPIENT"
                ? "SKIPPED"
                : "DISABLED",
            attempt_number: 1,
            error_code: errorCode,
          },
        });
        await ensureProviderAlert(transaction, {
          record,
          channel: recipient.channel,
          errorCode,
        });
      }

      await transaction.notification_outbox.updateMany({
        where: {
          id: record.id,
          organization_id: record.organization_id,
          dispatched_at: null,
        },
        data: {
          dispatched_at: new Date(),
        },
      });
    });

    materialized += 1;
    if (errorCode) {
      disabled += 1;
    }
  }

  return {
    materialized,
    disabled,
  };
}

async function releaseStaleJobs(now: Date): Promise<number> {
  const staleBefore = new Date(
    now.getTime() - STALE_LOCK_MINUTES * 60_000,
  );
  const result = await prisma.notification_jobs.updateMany({
    where: {
      status: "PROCESSING",
      locked_at: {
        lt: staleBefore,
      },
    },
    data: {
      status: "FAILED",
      locked_at: null,
      locked_by: null,
      next_attempt_at: now,
      last_error_code: "STALE_WORKER_LOCK",
    },
  });

  return result.count;
}

function safeProviderErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return "NOTIFICATION_PROVIDER_FAILED";
  }

  const normalized = error.message
    .toUpperCase()
    .replaceAll(/[^A-Z0-9_]/g, "_")
    .slice(0, 96);
  return normalized || "NOTIFICATION_PROVIDER_FAILED";
}

async function finishDisabledJob(input: {
  jobId: string;
  record: DeliveryRecord;
  channel: notification_channel;
  attemptNumber: number;
  errorCode: string;
}): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.notification_deliveries.upsert({
      where: {
        notification_job_id_attempt_number: {
          notification_job_id: input.jobId,
          attempt_number: input.attemptNumber,
        },
      },
      update: {},
      create: {
        organization_id: input.record.organization_id,
        notification_job_id: input.jobId,
        channel: input.channel,
        status:
          input.errorCode === "NO_NOTIFICATION_RECIPIENT"
            ? "SKIPPED"
            : "DISABLED",
        attempt_number: input.attemptNumber,
        error_code: input.errorCode,
      },
    });
    await transaction.notification_jobs.update({
      where: {
        id: input.jobId,
      },
      data: {
        status: "CANCELLED",
        attempt_count: input.attemptNumber,
        completed_at: new Date(),
        locked_at: null,
        locked_by: null,
        last_error_code: input.errorCode,
      },
    });
    await ensureProviderAlert(transaction, {
      record: input.record,
      channel: input.channel,
      errorCode: input.errorCode,
    });
  });
}

async function processRunnableJobs(
  workerId: string,
  now: Date,
): Promise<{
  sent: number;
  disabled: number;
  failed: number;
  deadLettered: number;
}> {
  const jobs = await prisma.notification_jobs.findMany({
    where: {
      status: {
        in: ["PENDING", "FAILED"],
      },
      scheduled_at: {
        lte: now,
      },
      next_attempt_at: {
        lte: now,
      },
    },
    orderBy: [
      {
        next_attempt_at: "asc",
      },
      {
        created_at: "asc",
      },
    ],
    take: DELIVERY_BATCH_SIZE,
    select: {
      id: true,
      status: true,
      channel: true,
      attempt_count: true,
      max_attempts: true,
      notification_outbox: {
        include: {
          organizations: {
            select: {
              name: true,
              notification_integrations: {
                select: {
                  channel: true,
                  status: true,
                },
              },
            },
          },
          locations: {
            select: {
              name: true,
              timezone: true,
            },
          },
          customers: {
            select: {
              display_name: true,
              contact_preference: true,
              customer_contacts: {
                select: {
                  contact_type: true,
                  normalized_value: true,
                  is_primary: true,
                },
              },
              customer_contact_links: {
                where: {
                  is_active: true,
                  channel: "LINE",
                },
                orderBy: {
                  linked_at: "desc",
                },
                take: 1,
                select: {
                  provider_user_reference: true,
                },
              },
            },
          },
          bookings: {
            select: {
              booking_segments: {
                orderBy: {
                  sort_order: "asc",
                },
                take: 1,
                select: {
                  service_name_snapshot: true,
                  starts_at: true,
                },
              },
            },
          },
        },
      },
    },
  });

  let sent = 0;
  let disabled = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of jobs) {
    const claimed = await prisma.notification_jobs.updateMany({
      where: {
        id: job.id,
        status: job.status,
        attempt_count: job.attempt_count,
      },
      data: {
        status: "PROCESSING",
        locked_at: now,
        locked_by: workerId,
      },
    });
    if (claimed.count === 0) {
      continue;
    }

    const record = job.notification_outbox;
    const recipient = resolveRecipient(record);
    const attemptNumber = job.attempt_count + 1;
      const errorCode =
        recipient.channel !== job.channel
          ? "RECIPIENT_CHANNEL_CHANGED"
          : await disabledCode({
            record,
            channel: job.channel,
            address: recipient.address,
          });

    if (errorCode || !recipient.address) {
      await finishDisabledJob({
        jobId: job.id,
        record,
        channel: job.channel,
        attemptNumber,
        errorCode: errorCode ?? "NO_NOTIFICATION_RECIPIENT",
      });
      disabled += 1;
      continue;
    }

    const segment = record.bookings?.booking_segments[0];
    const presentation = renderNotification({
      eventType: record.event_type,
      organizationName: record.organizations.name,
      locationName: record.locations?.name ?? record.organizations.name,
      timezone: record.locations?.timezone ?? "Asia/Taipei",
      customerName: record.customers?.display_name ?? "顧客",
      serviceName: segment?.service_name_snapshot ?? null,
      startsAt: segment?.starts_at ?? null,
    });
    const adapter = await getNotificationAdapterForLocation(job.channel,
      record.organization_id,record.location_id);

    try {
      const result = await adapter.send({
        recipient: recipient.address,
        ...presentation,
      });
      await prisma.$transaction([
        prisma.notification_deliveries.create({
          data: {
            organization_id: record.organization_id,
            notification_job_id: job.id,
            channel: job.channel,
            status: "SENT",
            attempt_number: attemptNumber,
            provider_message_id: result.providerMessageId,
            delivered_at: new Date(),
          },
        }),
        prisma.notification_jobs.update({
          where: {
            id: job.id,
          },
          data: {
            status: "SUCCEEDED",
            attempt_count: attemptNumber,
            completed_at: new Date(),
            locked_at: null,
            locked_by: null,
            last_error_code: null,
          },
        }),
        prisma.operational_events.create({
          data: {
            organization_id: record.organization_id,
            location_id: record.location_id,
            event_type: "NOTIFICATION_SENT",
            target_type: "NOTIFICATION_JOB",
            target_id: job.id,
            payload: {
              channel: job.channel,
              eventType: record.event_type,
            },
          },
        }),
      ]);
      sent += 1;
    } catch (error) {
      const providerErrorCode = safeProviderErrorCode(error);
      const isDeadLetter = attemptNumber >= job.max_attempts;
      const nextAttemptAt = new Date(
        now.getTime() + retryDelayMilliseconds(attemptNumber),
      );

      await prisma.$transaction(async (transaction) => {
        await transaction.notification_deliveries.create({
          data: {
            organization_id: record.organization_id,
            notification_job_id: job.id,
            channel: job.channel,
            status: "FAILED",
            attempt_number: attemptNumber,
            error_code: providerErrorCode,
          },
        });
        await transaction.notification_jobs.update({
          where: {
            id: job.id,
          },
          data: {
            status: isDeadLetter ? "DEAD_LETTER" : "FAILED",
            attempt_count: attemptNumber,
            next_attempt_at: nextAttemptAt,
            completed_at: isDeadLetter ? new Date() : null,
            locked_at: null,
            locked_by: null,
            last_error_code: providerErrorCode,
          },
        });
        await ensureProviderAlert(transaction, {
          record,
          channel: job.channel,
          errorCode: providerErrorCode,
        });
      });

      if (isDeadLetter) {
        deadLettered += 1;
      } else {
        failed += 1;
      }
    }
  }

  return {
    sent,
    disabled,
    failed,
    deadLettered,
  };
}

export async function runNotificationCycle(input: {
  workerId: string;
  now?: Date;
}): Promise<NotificationCycleResult> {
  const now = input.now ?? new Date();
  const staleJobsReleased = await releaseStaleJobs(now);
  const remindersEnqueued = await enqueueBookingReminders(now);
  const materialized = await materializeNotificationJobs();
  const delivered = await processRunnableJobs(input.workerId, now);

  return {
    remindersEnqueued,
    outboxMaterialized: materialized.materialized,
    sent: delivered.sent,
    disabled: materialized.disabled + delivered.disabled,
    failed: delivered.failed,
    deadLettered: delivered.deadLettered,
    staleJobsReleased,
  };
}

export const notificationWorkerInternals = {
  safeProviderErrorCode,
} as const;
