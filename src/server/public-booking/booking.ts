import "server-only";

import { Prisma } from "@prisma/client";

import {
  calculateCancellationFeeMinor,
  calculateDepositMinor,
  type CancellationFeePolicy,
  type DepositPolicy,
} from "../booking/pricing";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { sha256 } from "../security/crypto";
import {
  deriveTrackingToken,
  type PublicSessionContext,
} from "./context";
import type { ConfirmPublicBookingInput } from "./schemas";

type BookingSummaryRecord = Awaited<
  ReturnType<typeof findBookingByTrackingHash>
>;

export type PublicBookingSummary = {
  trackingToken: string;
  booking: {
    id: string;
    status: string;
    paymentStatus: string;
    totalMinor: number;
    depositRequiredMinor: number;
    paidMinor: number;
    cancellationFeeMinor: number;
    currency: string;
    customerName: string;
    contactHint: string | null;
    location: {
      organizationSlug: string;
      locationSlug: string;
      name: string;
      address: string;
      phone: string;
      timezone: string;
    };
    service: {
      variantId: string;
      name: string;
      variantName: string;
      staffName: string | null;
      startsAt: string;
      endsAt: string;
    };
    customerActions: {
      cancellationEnabled: boolean;
      rescheduleEnabled: boolean;
    };
  };
};

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("886")) {
    return `+${digits}`;
  }
  if (digits.startsWith("09") && digits.length === 10) {
    return `+886${digits.slice(1)}`;
  }
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function contactHint(
  contacts: ReadonlyArray<{
    contact_type: string;
    normalized_value: string;
  }>,
): string | null {
  const phone = contacts.find(
    (contact) => contact.contact_type === "PHONE",
  );
  if (phone) {
    return `手機末四碼 ${phone.normalized_value.slice(-4)}`;
  }

  const email = contacts.find(
    (contact) => contact.contact_type === "EMAIL",
  );
  if (email) {
    const [name, domain] = email.normalized_value.split("@");
    return `${name?.slice(0, 2) ?? ""}***@${domain ?? ""}`;
  }
  return null;
}

async function findBookingByTrackingHash(trackingHash: string) {
  return prisma.bookings.findUnique({
    where: {
      tracking_token_hash: trackingHash,
    },
    select: {
      id: true,
      status: true,
      payment_status: true,
      total_minor: true,
      deposit_required_minor: true,
      paid_minor: true,
      cancellation_fee_minor: true,
      currency: true,
      customers: {
        select: {
          display_name: true,
          customer_contacts: {
            where: {
              is_primary: true,
            },
            select: {
              contact_type: true,
              normalized_value: true,
            },
          },
        },
      },
      locations: {
        select: {
          slug: true,
          name: true,
          address: true,
          phone: true,
          timezone: true,
          organizations: {
            select: {
              slug: true,
            },
          },
          location_booking_policies: {
            select: {
              customer_cancellation_enabled: true,
              customer_reschedule_enabled: true,
            },
          },
        },
      },
      booking_segments: {
        orderBy: {
          sort_order: "asc",
        },
        take: 1,
        select: {
          service_name_snapshot: true,
          service_variant_id: true,
          variant_name_snapshot: true,
          staff_name_snapshot: true,
          starts_at: true,
          ends_at: true,
        },
      },
    },
  });
}

function toPublicBookingSummary(
  record: NonNullable<BookingSummaryRecord>,
  trackingToken: string,
): PublicBookingSummary {
  const segment = record.booking_segments[0];
  if (!segment) {
    throw new AppError("INTERNAL_ERROR", "預約資料不完整。", 500);
  }

  const policy = record.locations.location_booking_policies;
  const mutableStatus = ["PENDING_PAYMENT", "CONFIRMED"].includes(
    record.status,
  );

  return {
    trackingToken,
    booking: {
      id: record.id,
      status: record.status,
      paymentStatus: record.payment_status,
      totalMinor: record.total_minor,
      depositRequiredMinor: record.deposit_required_minor,
      paidMinor: record.paid_minor,
      cancellationFeeMinor: record.cancellation_fee_minor,
      currency: record.currency,
      customerName: record.customers.display_name,
      contactHint: contactHint(record.customers.customer_contacts),
      location: {
        organizationSlug: record.locations.organizations.slug,
        locationSlug: record.locations.slug,
        name: record.locations.name,
        address: record.locations.address,
        phone: record.locations.phone,
        timezone: record.locations.timezone,
      },
      service: {
        variantId: segment.service_variant_id ?? "",
        name: segment.service_name_snapshot,
        variantName: segment.variant_name_snapshot,
        staffName: segment.staff_name_snapshot,
        startsAt: segment.starts_at.toISOString(),
        endsAt: segment.ends_at.toISOString(),
      },
      customerActions: {
        cancellationEnabled:
          mutableStatus &&
          (policy?.customer_cancellation_enabled ?? false),
        rescheduleEnabled:
          record.status === "CONFIRMED" &&
          record.paid_minor === 0 &&
          (policy?.customer_reschedule_enabled ?? false),
      },
    },
  };
}

export async function getPublicBooking(
  trackingToken: string,
): Promise<PublicBookingSummary> {
  const record = await findBookingByTrackingHash(sha256(trackingToken));
  if (!record) {
    throw new AppError("NOT_FOUND", "找不到預約資料。", 404);
  }
  return toPublicBookingSummary(record, trackingToken);
}

function resolveDepositPolicy(input: {
  totalMinor: number;
  locationOverrideFixed: number | null;
  locationOverridePercentage: Prisma.Decimal | null;
  variantFixed: number | null;
  variantPercentage: Prisma.Decimal | null;
  policy:
    | {
        mode: string;
        fixed_amount_minor: number | null;
        percentage: Prisma.Decimal | null;
        payment_window_minutes: number;
      }
    | null;
}): {
  depositMinor: number;
  paymentWindowMinutes: number;
  snapshot: Prisma.InputJsonObject;
} {
  let policy: DepositPolicy = { mode: "NONE" };
  let source = "NONE";
  const paymentWindowMinutes = input.policy?.payment_window_minutes ?? 15;

  if (input.locationOverrideFixed !== null) {
    policy = {
      mode: "FIXED",
      fixedAmountMinor: input.locationOverrideFixed,
    };
    source = "LOCATION_SERVICE_FIXED";
  } else if (input.locationOverridePercentage !== null) {
    policy = {
      mode: "PERCENTAGE",
      percentage: Number(input.locationOverridePercentage),
    };
    source = "LOCATION_SERVICE_PERCENTAGE";
  } else if (input.variantFixed !== null) {
    policy = {
      mode: "FIXED",
      fixedAmountMinor: input.variantFixed,
    };
    source = "SERVICE_VARIANT_FIXED";
  } else if (input.variantPercentage !== null) {
    policy = {
      mode: "PERCENTAGE",
      percentage: Number(input.variantPercentage),
    };
    source = "SERVICE_VARIANT_PERCENTAGE";
  } else if (input.policy?.mode === "FIXED") {
    policy = {
      mode: "FIXED",
      fixedAmountMinor: input.policy.fixed_amount_minor ?? 0,
    };
    source = "LOCATION_POLICY_FIXED";
  } else if (input.policy?.mode === "PERCENTAGE") {
    policy = {
      mode: "PERCENTAGE",
      percentage: Number(input.policy.percentage ?? 0),
    };
    source = "LOCATION_POLICY_PERCENTAGE";
  }

  return {
    depositMinor: calculateDepositMinor(input.totalMinor, policy),
    paymentWindowMinutes,
    snapshot: {
      source,
      mode: policy.mode,
      paymentWindowMinutes,
      ...(policy.mode === "FIXED"
        ? { fixedAmountMinor: policy.fixedAmountMinor }
        : {}),
      ...(policy.mode === "PERCENTAGE"
        ? { percentage: policy.percentage }
        : {}),
    },
  };
}

export async function confirmPublicBooking(input: {
  context: PublicSessionContext;
  payload: ConfirmPublicBookingInput;
  idempotencyKey: string;
}): Promise<PublicBookingSummary> {
  await prisma.$queryRaw(
    Prisma.sql`select beauty_private.expire_booking_holds()`,
  );

  const trackingToken = deriveTrackingToken(input.payload.holdToken);
  const trackingHash = sha256(trackingToken);
  const existing = await findBookingByTrackingHash(trackingHash);
  if (existing) {
    return toPublicBookingSummary(existing, trackingToken);
  }

  const holdHash = sha256(input.payload.holdToken);
  const phone = normalizePhone(input.payload.customer.phone);
  const email = input.payload.customer.email?.trim().toLowerCase() || null;
  const idempotencyHash = sha256(input.idempotencyKey);

  try {
    await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`
            select id
            from public.booking_holds
            where token_hash = ${holdHash}
            for update
          `,
        );

        const hold = await transaction.booking_holds.findUnique({
          where: {
            token_hash: holdHash,
          },
          select: {
            id: true,
            status: true,
            expires_at: true,
            organization_id: true,
            location_id: true,
            public_booking_session_id: true,
            staff_profile_id: true,
            starts_at: true,
            ends_at: true,
            public_booking_sessions: {
              select: {
                status: true,
                expires_at: true,
              },
            },
            staff_profiles: {
              select: {
                display_name: true,
              },
            },
            service_variants: {
              select: {
                id: true,
                service_id: true,
                name: true,
                duration_minutes: true,
                price_minor: true,
                pre_buffer_minutes: true,
                post_buffer_minutes: true,
                deposit_fixed_minor: true,
                deposit_percentage: true,
                services: {
                  select: {
                    name: true,
                    booking_notice: true,
                  },
                },
                location_services: {
                  where: {
                    location_id: input.context.locationId,
                    is_active: true,
                    online_booking_enabled: true,
                  },
                  take: 1,
                  select: {
                    price_override_minor: true,
                    duration_override_minutes: true,
                    deposit_fixed_override_minor: true,
                    deposit_percentage_override: true,
                  },
                },
              },
            },
          },
        });

        if (
          !hold ||
          hold.organization_id !== input.context.organizationId ||
          hold.location_id !== input.context.locationId ||
          hold.public_booking_session_id !== input.context.sessionId ||
          hold.status !== "ACTIVE" ||
          hold.expires_at <= new Date() ||
          hold.public_booking_sessions.status !== "ACTIVE" ||
          hold.public_booking_sessions.expires_at <= new Date()
        ) {
          throw new AppError(
            "CONFLICT",
            "保留時段已失效，請重新選擇。",
            409,
          );
        }

        const locationService =
          hold.service_variants.location_services[0];
        if (!locationService) {
          throw new AppError(
            "CONFLICT",
            "此服務目前無法預約。",
            409,
          );
        }

        const contactMatches =
          await transaction.customer_contacts.findMany({
            where: {
              organization_id: input.context.organizationId,
              OR: [
                {
                  contact_type: "PHONE",
                  normalized_value: phone,
                },
                ...(email
                  ? [
                      {
                        contact_type: "EMAIL" as const,
                        normalized_value: email,
                      },
                    ]
                  : []),
              ],
            },
            select: {
              customer_id: true,
              contact_type: true,
            },
          });

        const phoneMatch = contactMatches.find(
          (contact) => contact.contact_type === "PHONE",
        );
        const emailMatch = contactMatches.find(
          (contact) => contact.contact_type === "EMAIL",
        );
        const existingCustomerId =
          phoneMatch?.customer_id ?? emailMatch?.customer_id;
        const customer = existingCustomerId
          ? await transaction.customers.findFirstOrThrow({
              where: {
                id: existingCustomerId,
                organization_id: input.context.organizationId,
                is_active: true,
              },
              select: {
                id: true,
              },
            })
          : await transaction.customers.create({
              data: {
                organization_id: input.context.organizationId,
                display_name: input.payload.customer.displayName,
                source: "WEBSITE",
                general_preferences:
                  input.payload.customer.note || null,
                customer_contacts: {
                  create: [
                    {
                      contact_type: "PHONE",
                      value: input.payload.customer.phone,
                      normalized_value: phone,
                      is_primary: true,
                    },
                    ...(email
                      ? [
                          {
                            contact_type: "EMAIL" as const,
                            value: email,
                            normalized_value: email,
                            is_primary: false,
                          },
                        ]
                      : []),
                  ],
                },
              },
              select: {
                id: true,
              },
            });

        if (existingCustomerId) {
          const existingPhone = contactMatches.some(
            (contact) =>
              contact.contact_type === "PHONE" &&
              contact.customer_id === customer.id,
          );
          if (!existingPhone) {
            await transaction.customer_contacts.create({
              data: {
                organization_id: input.context.organizationId,
                customer_id: customer.id,
                contact_type: "PHONE",
                value: input.payload.customer.phone,
                normalized_value: phone,
                is_primary: true,
              },
            });
          }

          const existingEmail = contactMatches.some(
            (contact) =>
              contact.contact_type === "EMAIL" &&
              contact.customer_id === customer.id,
          );
          if (email && !existingEmail && !emailMatch) {
            await transaction.customer_contacts.create({
              data: {
                organization_id: input.context.organizationId,
                customer_id: customer.id,
                contact_type: "EMAIL",
                value: email,
                normalized_value: email,
              },
            });
          }
        }

        const depositPolicy =
          await transaction.deposit_policies.findFirst({
            where: {
              organization_id: input.context.organizationId,
              location_id: input.context.locationId,
              is_active: true,
              OR: [
                {
                  service_variant_id:
                    hold.service_variants.id,
                },
                {
                  service_variant_id: null,
                },
              ],
            },
            orderBy: {
              service_variant_id: "desc",
            },
            select: {
              mode: true,
              fixed_amount_minor: true,
              percentage: true,
              payment_window_minutes: true,
            },
          });
        const cancellationPolicy =
          await transaction.cancellation_policies.findFirst({
            where: {
              organization_id: input.context.organizationId,
              location_id: input.context.locationId,
              is_active: true,
              OR: [
                {
                  service_variant_id:
                    hold.service_variants.id,
                },
                {
                  service_variant_id: null,
                },
              ],
            },
            orderBy: {
              service_variant_id: "desc",
            },
            select: {
              name: true,
              free_cancellation_hours: true,
              late_fee_mode: true,
              late_fee_fixed_minor: true,
              late_fee_percentage: true,
            },
          });

        const totalMinor =
          locationService.price_override_minor ??
          hold.service_variants.price_minor;
        const deposit = resolveDepositPolicy({
          totalMinor,
          locationOverrideFixed:
            locationService.deposit_fixed_override_minor,
          locationOverridePercentage:
            locationService.deposit_percentage_override,
          variantFixed:
            hold.service_variants.deposit_fixed_minor,
          variantPercentage:
            hold.service_variants.deposit_percentage,
          policy: depositPolicy,
        });
        const status =
          deposit.depositMinor > 0 ? "PENDING_PAYMENT" : "CONFIRMED";
        const cancellationSnapshot = {
          name: cancellationPolicy?.name ?? "一般取消規則",
          freeCancellationHours:
            cancellationPolicy?.free_cancellation_hours ?? 24,
          lateFeeMode:
            cancellationPolicy?.late_fee_mode ?? "NONE",
          lateFeeFixedMinor:
            cancellationPolicy?.late_fee_fixed_minor ?? null,
          lateFeePercentage: cancellationPolicy?.late_fee_percentage
            ? Number(cancellationPolicy.late_fee_percentage)
            : null,
        };

        const booking = await transaction.bookings.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            customer_id: customer.id,
            source: "ONLINE",
            status,
            subtotal_minor: totalMinor,
            total_minor: totalMinor,
            deposit_required_minor: deposit.depositMinor,
            currency: input.context.currency,
            policy_snapshot: {
              version: "2026-07-28",
              deposit: deposit.snapshot,
              cancellation: cancellationSnapshot,
              bookingNotice:
                hold.service_variants.services.booking_notice,
            },
            public_note: input.payload.customer.note || null,
            tracking_token_hash: trackingHash,
            is_test: input.context.isTest,
            confirmed_at:
              status === "CONFIRMED" ? new Date() : null,
          },
          select: {
            id: true,
          },
        });

        const durationMinutes =
          locationService.duration_override_minutes ??
          hold.service_variants.duration_minutes;
        const segment = await transaction.booking_segments.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            booking_id: booking.id,
            service_id: hold.service_variants.service_id,
            service_variant_id: hold.service_variants.id,
            assigned_staff_id: hold.staff_profile_id,
            service_name_snapshot:
              hold.service_variants.services.name,
            variant_name_snapshot: hold.service_variants.name,
            staff_name_snapshot: hold.staff_profiles.display_name,
            starts_at: hold.starts_at,
            ends_at: hold.ends_at,
            duration_minutes: durationMinutes,
            pre_buffer_minutes:
              hold.service_variants.pre_buffer_minutes,
            post_buffer_minutes:
              hold.service_variants.post_buffer_minutes,
            price_minor: totalMinor,
          },
          select: {
            id: true,
          },
        });

        await transaction.booking_staff_allocations.updateMany({
          where: {
            booking_hold_id: hold.id,
          },
          data: {
            booking_hold_id: null,
            booking_id: booking.id,
            booking_segment_id: segment.id,
          },
        });
        await transaction.booking_resource_allocations.updateMany({
          where: {
            booking_hold_id: hold.id,
          },
          data: {
            booking_hold_id: null,
            booking_id: booking.id,
            booking_segment_id: segment.id,
          },
        });

        await transaction.booking_holds.update({
          where: {
            id: hold.id,
          },
          data: {
            status: "CONFIRMED",
            confirmed_at: new Date(),
          },
        });
        await transaction.public_booking_sessions.update({
          where: {
            id: input.context.sessionId,
          },
          data: {
            status: "CONSUMED",
            consumed_at: new Date(),
          },
        });

        await transaction.customer_consents.createMany({
          data: [
            {
              organization_id: input.context.organizationId,
              customer_id: customer.id,
              consent_type: "SERVICE",
              status: "GRANTED",
              source: "PUBLIC_BOOKING",
              policy_version: "2026-07-28",
            },
            ...(input.payload.consents.marketing
              ? [
                  {
                    organization_id:
                      input.context.organizationId,
                    customer_id: customer.id,
                    consent_type: "MARKETING" as const,
                    status: "GRANTED" as const,
                    source: "PUBLIC_BOOKING",
                    policy_version: "2026-07-28",
                  },
                ]
              : []),
          ],
        });

        if (deposit.depositMinor > 0) {
          await transaction.booking_payments.create({
            data: {
              organization_id: input.context.organizationId,
              location_id: input.context.locationId,
              booking_id: booking.id,
              method: "MANUAL_TRANSFER",
              status: "UNPAID",
              amount_minor: deposit.depositMinor,
              currency: input.context.currency,
              note: `請於 ${deposit.paymentWindowMinutes} 分鐘內完成訂金付款。`,
            },
          });
        }

        await transaction.booking_events.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            booking_id: booking.id,
            event_type: "BOOKING_CREATED",
            new_status: status,
            public_actor: true,
            metadata: {
              publicSessionId: input.context.sessionId,
              requestId: input.context.requestId,
            },
          },
        });
        await transaction.notification_outbox.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            booking_id: booking.id,
            customer_id: customer.id,
            event_type:
              status === "PENDING_PAYMENT"
                ? "BOOKING_PAYMENT_PENDING"
                : "BOOKING_CONFIRMED",
            payload: {
              bookingId: booking.id,
              serviceName: hold.service_variants.services.name,
              startsAt: hold.starts_at.toISOString(),
              status,
            },
            idempotency_key: `booking:${booking.id}:created`,
          },
        });
        await transaction.public_booking_attempts.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            public_booking_session_id: input.context.sessionId,
            request_id: input.context.requestId,
            event_type: "CONFIRM_BOOKING",
            outcome: "ALLOWED",
            reason_code: "BOOKING_CREATED",
            session_token_hash: sha256(input.context.sessionToken),
            idempotency_hash: idempotencyHash,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      const idempotent = await findBookingByTrackingHash(trackingHash);
      if (idempotent) {
        return toPublicBookingSummary(idempotent, trackingToken);
      }
    }
    throw error;
  }

  const created = await findBookingByTrackingHash(trackingHash);
  if (!created) {
    throw new AppError("INTERNAL_ERROR", "預約建立失敗。", 500);
  }
  return toPublicBookingSummary(created, trackingToken);
}

function cancellationFeePolicyFromSnapshot(
  snapshot: Prisma.JsonValue,
): CancellationFeePolicy {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    return {
      freeCancellationHours: 24,
      lateFee: { mode: "NONE" },
    };
  }

  const cancellation = snapshot.cancellation;
  if (
    !cancellation ||
    typeof cancellation !== "object" ||
    Array.isArray(cancellation)
  ) {
    return {
      freeCancellationHours: 24,
      lateFee: { mode: "NONE" },
    };
  }

  const freeCancellationHours =
    typeof cancellation.freeCancellationHours === "number"
      ? cancellation.freeCancellationHours
      : 24;
  const mode = cancellation.lateFeeMode;
  if (
    mode === "FIXED" &&
    typeof cancellation.lateFeeFixedMinor === "number"
  ) {
    return {
      freeCancellationHours,
      lateFee: {
        mode: "FIXED",
        fixedAmountMinor: cancellation.lateFeeFixedMinor,
      },
    };
  }
  if (
    mode === "PERCENTAGE" &&
    typeof cancellation.lateFeePercentage === "number"
  ) {
    return {
      freeCancellationHours,
      lateFee: {
        mode: "PERCENTAGE",
        percentage: cancellation.lateFeePercentage,
      },
    };
  }
  if (mode === "DEPOSIT_FORFEIT") {
    return {
      freeCancellationHours,
      lateFee: { mode: "DEPOSIT_FORFEIT" },
    };
  }
  return {
    freeCancellationHours,
    lateFee: { mode: "NONE" },
  };
}

export async function cancelPublicBooking(input: {
  trackingToken: string;
  reason: string;
  requestId: string;
}): Promise<PublicBookingSummary> {
  const trackingHash = sha256(input.trackingToken);

  await prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`
          select id
          from public.bookings
          where tracking_token_hash = ${trackingHash}
          for update
        `,
      );
      const booking = await transaction.bookings.findUnique({
        where: {
          tracking_token_hash: trackingHash,
        },
        select: {
          id: true,
          organization_id: true,
          location_id: true,
          customer_id: true,
          status: true,
          total_minor: true,
          paid_minor: true,
          policy_snapshot: true,
          booking_segments: {
            orderBy: {
              sort_order: "asc",
            },
            take: 1,
            select: {
              starts_at: true,
            },
          },
          locations: {
            select: {
              location_booking_policies: {
                select: {
                  customer_cancellation_enabled: true,
                },
              },
            },
          },
        },
      });

      if (!booking) {
        throw new AppError("NOT_FOUND", "找不到預約資料。", 404);
      }
      if (booking.status === "CANCELLED") {
        return;
      }
      if (
        !["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status) ||
        !booking.locations.location_booking_policies
          ?.customer_cancellation_enabled
      ) {
        throw new AppError(
          "CONFLICT",
          "此預約目前無法由顧客取消。",
          409,
        );
      }

      const segment = booking.booking_segments[0];
      if (!segment) {
        throw new AppError("INTERNAL_ERROR", "預約資料不完整。", 500);
      }
      const cancelledAt = new Date();
      const cancellationFeeMinor = calculateCancellationFeeMinor({
        totalMinor: booking.total_minor,
        depositPaidMinor: booking.paid_minor,
        startsAt: segment.starts_at,
        cancelledAt,
        policy: cancellationFeePolicyFromSnapshot(
          booking.policy_snapshot,
        ),
      });

      await transaction.bookings.update({
        where: {
          id: booking.id,
        },
        data: {
          status: "CANCELLED",
          cancellation_fee_minor: cancellationFeeMinor,
          cancellation_calculation: {
            calculatedAt: cancelledAt.toISOString(),
            feeMinor: cancellationFeeMinor,
            reason: input.reason,
          },
          cancelled_at: cancelledAt,
        },
      });
      await transaction.booking_events.create({
        data: {
          organization_id: booking.organization_id,
          location_id: booking.location_id,
          booking_id: booking.id,
          event_type: "BOOKING_CANCELLED",
          previous_status: booking.status,
          new_status: "CANCELLED",
          public_actor: true,
          reason_code: "CUSTOMER_CANCELLED",
          metadata: {
            requestId: input.requestId,
            reason: input.reason,
            cancellationFeeMinor,
          },
        },
      });
      await transaction.notification_outbox.create({
        data: {
          organization_id: booking.organization_id,
          location_id: booking.location_id,
          booking_id: booking.id,
          customer_id: booking.customer_id,
          event_type: "BOOKING_CANCELLED",
          payload: {
            bookingId: booking.id,
            cancellationFeeMinor,
          },
          idempotency_key: `booking:${booking.id}:cancelled`,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );

  return getPublicBooking(input.trackingToken);
}

export async function reschedulePublicBooking(input: {
  context: PublicSessionContext;
  trackingToken: string;
  holdToken: string;
  idempotencyKey: string;
}): Promise<PublicBookingSummary> {
  await prisma.$queryRaw(
    Prisma.sql`select beauty_private.expire_booking_holds()`,
  );

  const oldTrackingHash = sha256(input.trackingToken);
  const holdHash = sha256(input.holdToken);
  const newTrackingToken = deriveTrackingToken(input.holdToken);
  const newTrackingHash = sha256(newTrackingToken);
  const existing = await findBookingByTrackingHash(newTrackingHash);
  if (existing) {
    return toPublicBookingSummary(existing, newTrackingToken);
  }

  try {
    await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`
            select id
            from public.bookings
            where tracking_token_hash = ${oldTrackingHash}
            for update
          `,
        );
        await transaction.$queryRaw(
          Prisma.sql`
            select id
            from public.booking_holds
            where token_hash = ${holdHash}
            for update
          `,
        );

        const original = await transaction.bookings.findUnique({
          where: {
            tracking_token_hash: oldTrackingHash,
          },
          select: {
            id: true,
            organization_id: true,
            location_id: true,
            customer_id: true,
            status: true,
            payment_status: true,
            subtotal_minor: true,
            discount_minor: true,
            total_minor: true,
            deposit_required_minor: true,
            paid_minor: true,
            currency: true,
            is_test: true,
            policy_snapshot: true,
            public_note: true,
            booking_segments: {
              orderBy: {
                sort_order: "asc",
              },
              take: 1,
              select: {
                service_id: true,
                service_variant_id: true,
                service_name_snapshot: true,
                variant_name_snapshot: true,
                duration_minutes: true,
                pre_buffer_minutes: true,
                post_buffer_minutes: true,
                price_minor: true,
              },
            },
            locations: {
              select: {
                location_booking_policies: {
                  select: {
                    customer_reschedule_enabled: true,
                  },
                },
              },
            },
          },
        });
        const hold = await transaction.booking_holds.findUnique({
          where: {
            token_hash: holdHash,
          },
          select: {
            id: true,
            status: true,
            expires_at: true,
            organization_id: true,
            location_id: true,
            public_booking_session_id: true,
            staff_profile_id: true,
            starts_at: true,
            ends_at: true,
            public_booking_sessions: {
              select: {
                status: true,
                expires_at: true,
              },
            },
            staff_profiles: {
              select: {
                display_name: true,
              },
            },
            service_variants: {
              select: {
                id: true,
              },
            },
          },
        });

        const originalSegment = original?.booking_segments[0];
        if (!original || !originalSegment) {
          throw new AppError("NOT_FOUND", "找不到預約資料。", 404);
        }
        if (
          original.organization_id !== input.context.organizationId ||
          original.location_id !== input.context.locationId ||
          original.status !== "CONFIRMED" ||
          original.paid_minor > 0 ||
          !original.locations.location_booking_policies
            ?.customer_reschedule_enabled
        ) {
          throw new AppError(
            "CONFLICT",
            "此預約目前無法由顧客改期，請聯繫店家。",
            409,
          );
        }
        if (
          !hold ||
          hold.organization_id !== input.context.organizationId ||
          hold.location_id !== input.context.locationId ||
          hold.public_booking_session_id !== input.context.sessionId ||
          hold.status !== "ACTIVE" ||
          hold.expires_at <= new Date() ||
          hold.public_booking_sessions.status !== "ACTIVE" ||
          hold.public_booking_sessions.expires_at <= new Date() ||
          hold.service_variants.id !==
            originalSegment.service_variant_id
        ) {
          throw new AppError(
            "CONFLICT",
            "改期保留時段已失效，請重新選擇。",
            409,
          );
        }

        const replacement = await transaction.bookings.create({
          data: {
            organization_id: original.organization_id,
            location_id: original.location_id,
            customer_id: original.customer_id,
            source: "ONLINE",
            status: "CONFIRMED",
            payment_status: original.payment_status,
            subtotal_minor: original.subtotal_minor,
            discount_minor: original.discount_minor,
            total_minor: original.total_minor,
            deposit_required_minor:
              original.deposit_required_minor,
            paid_minor: 0,
            currency: original.currency,
            policy_snapshot:
              original.policy_snapshot === null
                ? Prisma.JsonNull
                : (original.policy_snapshot as Prisma.InputJsonValue),
            public_note: original.public_note,
            tracking_token_hash: newTrackingHash,
            is_test: original.is_test,
            rescheduled_from_booking_id: original.id,
            confirmed_at: new Date(),
          },
          select: {
            id: true,
          },
        });
        const segment = await transaction.booking_segments.create({
          data: {
            organization_id: original.organization_id,
            location_id: original.location_id,
            booking_id: replacement.id,
            service_id: originalSegment.service_id,
            service_variant_id:
              originalSegment.service_variant_id,
            assigned_staff_id: hold.staff_profile_id,
            service_name_snapshot:
              originalSegment.service_name_snapshot,
            variant_name_snapshot:
              originalSegment.variant_name_snapshot,
            staff_name_snapshot: hold.staff_profiles.display_name,
            starts_at: hold.starts_at,
            ends_at: hold.ends_at,
            duration_minutes: originalSegment.duration_minutes,
            pre_buffer_minutes:
              originalSegment.pre_buffer_minutes,
            post_buffer_minutes:
              originalSegment.post_buffer_minutes,
            price_minor: originalSegment.price_minor,
          },
          select: {
            id: true,
          },
        });

        await transaction.booking_staff_allocations.updateMany({
          where: {
            booking_hold_id: hold.id,
          },
          data: {
            booking_hold_id: null,
            booking_id: replacement.id,
            booking_segment_id: segment.id,
          },
        });
        await transaction.booking_resource_allocations.updateMany({
          where: {
            booking_hold_id: hold.id,
          },
          data: {
            booking_hold_id: null,
            booking_id: replacement.id,
            booking_segment_id: segment.id,
          },
        });
        await transaction.booking_holds.update({
          where: {
            id: hold.id,
          },
          data: {
            status: "CONFIRMED",
            confirmed_at: new Date(),
          },
        });
        await transaction.public_booking_sessions.update({
          where: {
            id: input.context.sessionId,
          },
          data: {
            status: "CONSUMED",
            consumed_at: new Date(),
          },
        });
        await transaction.bookings.update({
          where: {
            id: original.id,
          },
          data: {
            status: "RESCHEDULED",
            rescheduled_to_booking_id: replacement.id,
          },
        });

        await transaction.booking_events.createMany({
          data: [
            {
              organization_id: original.organization_id,
              location_id: original.location_id,
              booking_id: original.id,
              event_type: "BOOKING_RESCHEDULED_FROM",
              previous_status: "CONFIRMED",
              new_status: "RESCHEDULED",
              public_actor: true,
              metadata: {
                replacementBookingId: replacement.id,
                requestId: input.context.requestId,
              },
            },
            {
              organization_id: original.organization_id,
              location_id: original.location_id,
              booking_id: replacement.id,
              event_type: "BOOKING_RESCHEDULED_TO",
              new_status: "CONFIRMED",
              public_actor: true,
              metadata: {
                originalBookingId: original.id,
                requestId: input.context.requestId,
              },
            },
          ],
        });
        await transaction.notification_outbox.create({
          data: {
            organization_id: original.organization_id,
            location_id: original.location_id,
            booking_id: replacement.id,
            customer_id: original.customer_id,
            event_type: "BOOKING_RESCHEDULED",
            payload: {
              originalBookingId: original.id,
              bookingId: replacement.id,
              startsAt: hold.starts_at.toISOString(),
            },
            idempotency_key: `booking:${replacement.id}:rescheduled`,
          },
        });
        await transaction.public_booking_attempts.create({
          data: {
            organization_id: original.organization_id,
            location_id: original.location_id,
            public_booking_session_id: input.context.sessionId,
            request_id: input.context.requestId,
            event_type: "RESCHEDULE_BOOKING",
            outcome: "ALLOWED",
            reason_code: "BOOKING_RESCHEDULED",
            session_token_hash: sha256(input.context.sessionToken),
            idempotency_hash: sha256(input.idempotencyKey),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      const idempotent = await findBookingByTrackingHash(
        newTrackingHash,
      );
      if (idempotent) {
        return toPublicBookingSummary(
          idempotent,
          newTrackingToken,
        );
      }
    }
    throw error;
  }

  const replacement = await findBookingByTrackingHash(newTrackingHash);
  if (!replacement) {
    throw new AppError("INTERNAL_ERROR", "預約改期失敗。", 500);
  }
  return toPublicBookingSummary(replacement, newTrackingToken);
}
