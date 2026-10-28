import "server-only";
import {assertBookableStaff} from "../staff/service-capability";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { sha256 } from "../security/crypto";
import { formatDateInTimeZone } from "../time/timezone";
import { getPublicAvailability } from "./availability";
import {
  deriveHoldToken,
  type PublicSessionContext,
} from "./context";

export type BookingHoldResult = {
  holdToken: string;
  expiresAt: string;
  selection: {
    serviceVariantId: string;
    serviceName: string;
    variantName: string;
    staffProfileId: string;
    staffName: string;
    startsAt: string;
    endsAt: string;
    priceMinor: number;
    currency: string;
  };
};

export type BookingHoldReleaseResult = {
  released: boolean;
};

function isAllocationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P2002", "P2004", "P2034"].includes(error.code);
  }

  return (
    error instanceof Error &&
    (error.message.includes("no_overlap") ||
      error.message.includes("23P01") ||
      error.message.includes("could not serialize"))
  );
}

async function existingHoldResult(input: {
  context: PublicSessionContext;
  idempotencyKeyHash: string;
  holdToken: string;
}): Promise<BookingHoldResult | null> {
  const hold = await prisma.booking_holds.findFirst({
    where: {
      public_booking_session_id: input.context.sessionId,
      idempotency_key_hash: input.idempotencyKeyHash,
      status: {
        in: ["ACTIVE", "CONFIRMED"],
      },
    },
    select: {
      expires_at: true,
      starts_at: true,
      ends_at: true,
      service_variants: {
        select: {
          id: true,
          name: true,
          price_minor: true,
          services: {
            select: {
              name: true,
            },
          },
          location_services: {
            where: {
              location_id: input.context.locationId,
            },
            select: {
              price_override_minor: true,
            },
            take: 1,
          },
        },
      },
      staff_profiles: {
        select: {
          id: true,
          display_name: true,
        },
      },
    },
  });

  if (!hold) {
    return null;
  }

  const variant = hold.service_variants;
  return {
    holdToken: input.holdToken,
    expiresAt: hold.expires_at.toISOString(),
    selection: {
      serviceVariantId: variant.id,
      serviceName: variant.services.name,
      variantName: variant.name,
      staffProfileId: hold.staff_profiles.id,
      staffName: hold.staff_profiles.display_name,
      startsAt: hold.starts_at.toISOString(),
      endsAt: hold.ends_at.toISOString(),
      priceMinor:
        variant.location_services[0]?.price_override_minor ??
        variant.price_minor,
      currency: input.context.currency,
    },
  };
}

export async function createBookingHold(input: {
  context: PublicSessionContext;
  serviceVariantId: string;
  staffProfileId: string;
  startsAt: string;
  idempotencyKey: string;
  bypassOnlineLead?: boolean;
}): Promise<BookingHoldResult> {
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  const holdToken = deriveHoldToken({
    publicSessionToken: input.context.sessionToken,
    idempotencyKey: input.idempotencyKey,
  });
  const existing = await existingHoldResult({
    context: input.context,
    idempotencyKeyHash,
    holdToken,
  });
  if (existing) {
    return existing;
  }

  const requestedStart = new Date(input.startsAt);
  const localDate = formatDateInTimeZone(
    requestedStart,
    input.context.timezone,
  );
  const availability = await getPublicAvailability(input.context, {
    serviceVariantId: input.serviceVariantId,
    staffProfileId: input.staffProfileId,
    date: localDate,
  }, new Date(), input.bypassOnlineLead ? 0 : undefined);
  const availableSlot = availability.slots.find(
    (slot) =>
      slot.startsAt === requestedStart.toISOString() &&
      slot.availableStaff.includes(input.staffProfileId),
  );
  if (!availableSlot) {
    throw new AppError(
      "CONFLICT",
      "這個時段剛剛已被預約，請選擇其他時間。",
      409,
    );
  }

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        const locationService =
          await transaction.location_services.findFirst({
            where: {
              organization_id: input.context.organizationId,
              location_id: input.context.locationId,
              service_variant_id: input.serviceVariantId,
              is_active: true,
              online_booking_enabled: true,
              service_staff_assignments: {
                some: {
                  staff_profile_id: input.staffProfileId,
                  is_active: true,
                  online_booking_enabled: true,
                },
              },
            },
            select: {
              price_override_minor: true,
              duration_override_minutes: true,
              services: {
                select: {
                  name: true,
                  is_active: true,
                  online_booking_enabled: true,
                },
              },
              service_variants: {
                select: {
                  id: true,
                  name: true,
                  duration_minutes: true,
                  price_minor: true,
                  pre_buffer_minutes: true,
                  post_buffer_minutes: true,
                  is_active: true,
                  service_resource_requirements: {
                    where: {
                      is_required: true,
                    },
                    select: {
                      resource_type_id: true,
                      quantity: true,
                    },
                  },
                },
              },
            },
          });

        const staff = await transaction.staff_profiles.findFirst({
          where: {
            id: input.staffProfileId,
            organization_id: input.context.organizationId,
            is_active: true,
            public_visible: true,
          },
          select: {
            id: true,
            display_name: true,
          },
        });

        if (
          !locationService ||
          !locationService.services.is_active ||
          !locationService.services.online_booking_enabled ||
          !locationService.service_variants.is_active ||
          !staff
        ) {
          throw new AppError(
            "NOT_FOUND",
            "找不到可預約的服務。",
            404,
          );
        }

        await assertBookableStaff(transaction, {...input.context, serviceVariantId: input.serviceVariantId,
          staffProfileId: input.staffProfileId, startsAt: requestedStart});

        const replacementTime = new Date();
        await transaction.booking_holds.updateMany({
          where: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            public_booking_session_id: input.context.sessionId,
            status: "ACTIVE",
          },
          data: {
            status: "CANCELLED",
            cancelled_at: replacementTime,
            updated_at: replacementTime,
          },
        });

        const variant = locationService.service_variants;
        const durationMinutes =
          locationService.duration_override_minutes ??
          variant.duration_minutes;
        const serviceEndsAt = new Date(
          requestedStart.getTime() + durationMinutes * 60_000,
        );
        const allocationStartsAt = new Date(
          requestedStart.getTime() -
            variant.pre_buffer_minutes * 60_000,
        );
        const allocationEndsAt = new Date(
          serviceEndsAt.getTime() +
            variant.post_buffer_minutes * 60_000,
        );

        const policy =
          await transaction.location_booking_policies.findUnique({
            where: {
              location_id: input.context.locationId,
            },
            select: {
              hold_minutes: true,
            },
          });
        const expiresAt = new Date(
          Date.now() + (policy?.hold_minutes ?? 10) * 60_000,
        );

        const selectedResourceIds: string[] = [];
        for (const requirement of variant.service_resource_requirements) {
          const resources = await transaction.resources.findMany({
            where: {
              organization_id: input.context.organizationId,
              location_id: input.context.locationId,
              resource_type_id: requirement.resource_type_id,
              is_active: true,
              resource_time_off: {
                none: {
                  starts_at: { lt: allocationEndsAt },
                  ends_at: { gt: allocationStartsAt },
                },
              },
              booking_resource_allocations: {
                none: {
                  is_blocking: true,
                  starts_at: { lt: allocationEndsAt },
                  ends_at: { gt: allocationStartsAt },
                },
              },
            },
            orderBy: {
              sort_order: "asc",
            },
            take: requirement.quantity,
            select: {
              id: true,
            },
          });

          if (resources.length < requirement.quantity) {
            throw new AppError(
              "CONFLICT",
              "這個時段剛剛已被預約，請選擇其他時間。",
              409,
            );
          }
          selectedResourceIds.push(...resources.map(({ id }) => id));
        }

        const hold = await transaction.booking_holds.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            public_booking_session_id: input.context.sessionId,
            service_variant_id: input.serviceVariantId,
            staff_profile_id: input.staffProfileId,
            starts_at: requestedStart,
            ends_at: serviceEndsAt,
            token_hash: sha256(holdToken),
            idempotency_key_hash: idempotencyKeyHash,
            expires_at: expiresAt,
          },
          select: {
            id: true,
          },
        });

        await transaction.booking_staff_allocations.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            booking_hold_id: hold.id,
            staff_profile_id: input.staffProfileId,
            starts_at: allocationStartsAt,
            ends_at: allocationEndsAt,
          },
        });

        if (selectedResourceIds.length > 0) {
          await transaction.booking_resource_allocations.createMany({
            data: selectedResourceIds.map((resourceId) => ({
              organization_id: input.context.organizationId,
              location_id: input.context.locationId,
              booking_hold_id: hold.id,
              resource_id: resourceId,
              starts_at: allocationStartsAt,
              ends_at: allocationEndsAt,
            })),
          });
        }

        await transaction.public_booking_attempts.create({
          data: {
            organization_id: input.context.organizationId,
            location_id: input.context.locationId,
            public_booking_session_id: input.context.sessionId,
            request_id: input.context.requestId,
            event_type: "CREATE_HOLD",
            outcome: "ALLOWED",
            reason_code: "HOLD_CREATED",
            session_token_hash: sha256(input.context.sessionToken),
            idempotency_hash: idempotencyKeyHash,
          },
        });

        return {
          expiresAt,
          serviceName: locationService.services.name,
          variantName: variant.name,
          staffName: staff.display_name,
          endsAt: serviceEndsAt,
          priceMinor:
            locationService.price_override_minor ?? variant.price_minor,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    );

    return {
      holdToken,
      expiresAt: result.expiresAt.toISOString(),
      selection: {
        serviceVariantId: input.serviceVariantId,
        serviceName: result.serviceName,
        variantName: result.variantName,
        staffProfileId: input.staffProfileId,
        staffName: result.staffName,
        startsAt: requestedStart.toISOString(),
        endsAt: result.endsAt.toISOString(),
        priceMinor: result.priceMinor,
        currency: input.context.currency,
      },
    };
  } catch (error) {
    if (isAllocationConflict(error)) {
      const idempotent = await existingHoldResult({
        context: input.context,
        idempotencyKeyHash,
        holdToken,
      });
      if (idempotent) {
        return idempotent;
      }

      throw new AppError(
        "CONFLICT",
        "這個時段剛剛已被預約，請選擇其他時間。",
        409,
      );
    }
    throw error;
  }
}

export async function releaseBookingHold(input: {
  context: PublicSessionContext;
  holdToken: string;
}): Promise<BookingHoldReleaseResult> {
  const releasedAt = new Date();
  const result = await prisma.booking_holds.updateMany({
    where: {
      organization_id: input.context.organizationId,
      location_id: input.context.locationId,
      public_booking_session_id: input.context.sessionId,
      token_hash: sha256(input.holdToken),
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
      cancelled_at: releasedAt,
      updated_at: releasedAt,
    },
  });

  return {
    released: result.count > 0,
  };
}
