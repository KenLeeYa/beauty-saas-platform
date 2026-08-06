import "server-only";

import { Prisma } from "@prisma/client";

import {
  canTransitionBooking,
  type BookingStatus,
} from "../booking/state-machine";
import {
  assertCapability,
  type OrganizationContext,
  requireLocation,
} from "../authorization/context";
import { hasCapability } from "../authorization/capabilities";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

const notificationByStatus: Partial<
  Record<
    BookingStatus,
    | "BOOKING_CONFIRMED"
    | "BOOKING_CANCELLED"
    | "BOOKING_COMPLETED"
    | "NO_SHOW_NOTICE"
  >
> = {
  CONFIRMED: "BOOKING_CONFIRMED",
  CANCELLED: "BOOKING_CANCELLED",
  COMPLETED: "BOOKING_COMPLETED",
  NO_SHOW: "NO_SHOW_NOTICE",
};

export async function updateMerchantBookingStatus(input: {
  context: OrganizationContext;
  bookingId: string;
  nextStatus: BookingStatus;
  expectedVersion: number;
  reason?: string;
  requestId: string;
}): Promise<{
  id: string;
  status: string;
  version: number;
}> {
  const location = requireLocation(input.context);
  const canManageAll = hasCapability(
    input.context.roles,
    "booking.manage",
  );
  const canManageOwn = hasCapability(
    input.context.roles,
    "booking.own.manage",
  );
  if (!canManageAll && !canManageOwn) {
    assertCapability(input.context, "booking.manage");
  }

  return prisma.$transaction(
    async (transaction) => {
      const booking = await transaction.bookings.findFirst({
        where: {
          id: input.bookingId,
          organization_id: input.context.organization.id,
          location_id: location.id,
          ...(canManageOwn && !canManageAll
            ? {
                booking_segments: {
                  some: {
                    assigned_staff_id:
                      input.context.linkedStaffProfileId ??
                      "00000000-0000-0000-0000-000000000000",
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          status: true,
          version: true,
          customer_id: true,
        },
      });

      if (!booking) {
        throw new AppError("NOT_FOUND", "找不到預約資料。", 404);
      }
      if (
        !canTransitionBooking(
          booking.status,
          input.nextStatus,
        )
      ) {
        throw new AppError(
          "CONFLICT",
          `無法將預約由 ${booking.status} 變更為 ${input.nextStatus}。`,
          409,
        );
      }
      if (
        ["CANCELLED", "NO_SHOW", "EXPIRED"].includes(
          input.nextStatus,
        ) &&
        !input.reason
      ) {
        throw new AppError(
          "BAD_REQUEST",
          "此狀態變更需要填寫原因。",
          400,
        );
      }

      const timestampData: Prisma.bookingsUncheckedUpdateManyInput = {
        updated_by: input.context.session.profileId,
      };
      switch (input.nextStatus) {
        case "CONFIRMED":
          timestampData.confirmed_at = new Date();
          break;
        case "CHECKED_IN":
          timestampData.checked_in_at = new Date();
          break;
        case "IN_SERVICE":
          timestampData.service_started_at = new Date();
          break;
        case "COMPLETED":
          timestampData.completed_at = new Date();
          break;
        case "CANCELLED":
          timestampData.cancelled_at = new Date();
          break;
        case "EXPIRED":
          timestampData.expired_at = new Date();
          break;
        default:
          break;
      }

      const updated = await transaction.bookings.updateMany({
        where: {
          id: booking.id,
          organization_id: input.context.organization.id,
          location_id: location.id,
          status: booking.status,
          version: input.expectedVersion,
        },
        data: {
          status: input.nextStatus,
          ...timestampData,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "預約已被其他人更新，請重新整理後再試。",
          409,
        );
      }

      await transaction.booking_events.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          booking_id: booking.id,
          event_type: "STATUS_CHANGED",
          previous_status: booking.status,
          new_status: input.nextStatus,
          actor_profile_id: input.context.session.profileId,
          reason_code: input.reason || null,
          metadata: {
            requestId: input.requestId,
          },
        },
      });
      const notification = notificationByStatus[input.nextStatus];
      if (notification) {
        await transaction.notification_outbox.create({
          data: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            booking_id: booking.id,
            customer_id: booking.customer_id,
            event_type: notification,
            payload: {
              bookingId: booking.id,
              status: input.nextStatus,
            },
            idempotency_key: `booking:${booking.id}:status:${input.nextStatus}:${input.expectedVersion}`,
          },
        });
      }
      await transaction.audit_logs.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          actor_profile_id: input.context.session.profileId,
          action: "BOOKING_STATUS_UPDATE",
          target_type: "BOOKING",
          target_id: booking.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          before_json: {
            status: booking.status,
            version: booking.version,
          },
          after_json: {
            status: input.nextStatus,
          },
          metadata: {
            reason: input.reason ?? null,
          },
        },
      });

      const result = await transaction.bookings.findUniqueOrThrow({
        where: {
          id: booking.id,
        },
        select: {
          id: true,
          status: true,
          version: true,
        },
      });
      return result;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

export async function confirmMerchantPayment(input: {
  context: OrganizationContext;
  bookingId: string;
  amountMinor: number;
  expectedVersion: number;
  method: "CASH" | "MANUAL_TRANSFER" | "LINE_PAY_MANUAL" | "OTHER";
  reference?: string;
  note?: string;
  requestId: string;
}): Promise<{
  id: string;
  status: string;
  paymentStatus: string;
  paidMinor: number;
  version: number;
}> {
  assertCapability(input.context, "payment.manage");
  const location = requireLocation(input.context);

  return prisma.$transaction(
    async (transaction) => {
      const booking = await transaction.bookings.findFirst({
        where: {
          id: input.bookingId,
          organization_id: input.context.organization.id,
          location_id: location.id,
        },
        select: {
          id: true,
          status: true,
          version: true,
          total_minor: true,
          deposit_required_minor: true,
          paid_minor: true,
          currency: true,
          customer_id: true,
        },
      });
      if (!booking) {
        throw new AppError("NOT_FOUND", "找不到預約資料。", 404);
      }
      if (
        !["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status)
      ) {
        throw new AppError(
          "CONFLICT",
          "此預約目前無法記錄付款。",
          409,
        );
      }
      const outstanding = booking.total_minor - booking.paid_minor;
      if (input.amountMinor > outstanding) {
        throw new AppError(
          "BAD_REQUEST",
          "付款金額不可超過未付金額。",
          400,
        );
      }

      const payment =
        await transaction.booking_payments.findFirst({
          where: {
            organization_id: input.context.organization.id,
            booking_id: booking.id,
            status: "UNPAID",
          },
          orderBy: {
            created_at: "asc",
          },
          select: {
            id: true,
          },
        });
      if (payment) {
        await transaction.booking_payments.update({
          where: {
            id: payment.id,
          },
          data: {
            method: input.method,
            status: "PAID",
            amount_minor: input.amountMinor,
            reference: input.reference || null,
            note: input.note || null,
            recorded_by: input.context.session.profileId,
            confirmed_by: input.context.session.profileId,
            confirmed_at: new Date(),
          },
        });
      } else {
        await transaction.booking_payments.create({
          data: {
            organization_id: input.context.organization.id,
            location_id: location.id,
            booking_id: booking.id,
            method: input.method,
            status: "PAID",
            amount_minor: input.amountMinor,
            currency: booking.currency,
            reference: input.reference || null,
            note: input.note || null,
            recorded_by: input.context.session.profileId,
            confirmed_by: input.context.session.profileId,
            confirmed_at: new Date(),
          },
        });
      }

      const paidMinor = booking.paid_minor + input.amountMinor;
      const paymentStatus =
        paidMinor >= booking.total_minor ? "PAID" : "PARTIALLY_PAID";
      const confirmBooking =
        booking.status === "PENDING_PAYMENT" &&
        paidMinor >= booking.deposit_required_minor;
      const updated = await transaction.bookings.updateMany({
        where: {
          id: booking.id,
          organization_id: input.context.organization.id,
          location_id: location.id,
          version: input.expectedVersion,
          status: booking.status,
        },
        data: {
          paid_minor: paidMinor,
          payment_status: paymentStatus,
          ...(confirmBooking
            ? {
                status: "CONFIRMED",
                confirmed_at: new Date(),
              }
            : {}),
          updated_by: input.context.session.profileId,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "預約已被其他人更新，請重新整理後再試。",
          409,
        );
      }

      await transaction.booking_events.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          booking_id: booking.id,
          event_type: "PAYMENT_CONFIRMED",
          previous_status: booking.status,
          new_status: confirmBooking ? "CONFIRMED" : booking.status,
          actor_profile_id: input.context.session.profileId,
          metadata: {
            requestId: input.requestId,
            amountMinor: input.amountMinor,
            method: input.method,
          },
        },
      });
      await transaction.notification_outbox.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          booking_id: booking.id,
          customer_id: booking.customer_id,
          event_type: confirmBooking
            ? "BOOKING_CONFIRMED"
            : "BOOKING_PAYMENT_CONFIRMED",
          payload: {
            bookingId: booking.id,
            amountMinor: input.amountMinor,
            status: confirmBooking ? "CONFIRMED" : booking.status,
          },
          idempotency_key: `booking:${booking.id}:payment:${input.requestId}`,
        },
      });
      await transaction.audit_logs.create({
        data: {
          organization_id: input.context.organization.id,
          location_id: location.id,
          actor_profile_id: input.context.session.profileId,
          action: "BOOKING_PAYMENT_CONFIRM",
          target_type: "BOOKING",
          target_id: booking.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            paidMinor,
            paymentStatus,
            status: confirmBooking ? "CONFIRMED" : booking.status,
          },
        },
      });

      const result = await transaction.bookings.findUniqueOrThrow({
        where: {
          id: booking.id,
        },
        select: {
          id: true,
          status: true,
          payment_status: true,
          paid_minor: true,
          version: true,
        },
      });
      return {
        id: result.id,
        status: result.status,
        paymentStatus: result.payment_status,
        paidMinor: result.paid_minor,
        version: result.version,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}
