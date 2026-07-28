import "server-only";

import { Prisma } from "@prisma/client";

import { generateAvailableSlots, type BusyInterval } from "../availability/slots";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import {
  addLocalDays,
  databaseTimeToString,
  formatDateInTimeZone,
  localDayOfWeek,
  zonedDateTimeToUtc,
} from "../time/timezone";
import type { PublicSessionContext } from "./context";
import type { PublicAvailabilityInput } from "./schemas";

type LocalInterval = {
  opensAt: string;
  closesAt: string;
};

type ResourceCandidate = {
  id: string;
  resourceTypeId: string;
  rules: LocalInterval[];
  busy: BusyInterval[];
};

export type PublicAvailability = {
  date: string;
  timezone: string;
  service: {
    id: string;
    name: string;
    variantId: string;
    variantName: string;
    durationMinutes: number;
    priceMinor: number;
    currency: string;
  };
  staff: Array<{
    id: string;
    displayName: string;
    title: string;
  }>;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    localTime: string;
    availableStaff: string[];
  }>;
};

function maxTime(left: string, right: string): string {
  return left > right ? left : right;
}

function minTime(left: string, right: string): string {
  return left < right ? left : right;
}

function intersectLocalIntervals(
  left: readonly LocalInterval[],
  right: readonly LocalInterval[],
): LocalInterval[] {
  const intersections: LocalInterval[] = [];
  for (const leftInterval of left) {
    for (const rightInterval of right) {
      const opensAt = maxTime(leftInterval.opensAt, rightInterval.opensAt);
      const closesAt = minTime(
        leftInterval.closesAt,
        rightInterval.closesAt,
      );
      if (opensAt < closesAt) {
        intersections.push({ opensAt, closesAt });
      }
    }
  }
  return intersections;
}

function overlaps(left: BusyInterval, right: BusyInterval): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

function resourceAllowsInterval(
  resource: ResourceCandidate,
  interval: BusyInterval,
  localWindow: LocalInterval,
  date: string,
  timezone: string,
): boolean {
  const rules =
    resource.rules.length > 0 ? resource.rules : [localWindow];
  const insideRule = rules.some((rule) => {
    const startsAt = zonedDateTimeToUtc(date, rule.opensAt, timezone);
    const endsAt = zonedDateTimeToUtc(date, rule.closesAt, timezone);
    return interval.startsAt >= startsAt && interval.endsAt <= endsAt;
  });

  return insideRule && !resource.busy.some((busy) => overlaps(interval, busy));
}

function selectResources(input: {
  requirements: ReadonlyArray<{
    resourceTypeId: string;
    quantity: number;
  }>;
  candidates: readonly ResourceCandidate[];
  interval: BusyInterval;
  localWindow: LocalInterval;
  date: string;
  timezone: string;
}): string[] | null {
  const selected: string[] = [];

  for (const requirement of input.requirements) {
    const available = input.candidates.filter(
      (candidate) =>
        candidate.resourceTypeId === requirement.resourceTypeId &&
        resourceAllowsInterval(
          candidate,
          input.interval,
          input.localWindow,
          input.date,
          input.timezone,
        ),
    );

    if (available.length < requirement.quantity) {
      return null;
    }
    selected.push(
      ...available.slice(0, requirement.quantity).map(({ id }) => id),
    );
  }

  return selected;
}

export async function getPublicAvailability(
  context: PublicSessionContext,
  input: PublicAvailabilityInput,
  now = new Date(),
): Promise<PublicAvailability> {
  await prisma.$queryRaw(
    Prisma.sql`select beauty_private.expire_booking_holds()`,
  );
  const ignoredHoldIds = (
    await prisma.booking_holds.findMany({
      where: {
        organization_id: context.organizationId,
        location_id: context.locationId,
        public_booking_session_id: context.sessionId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    })
  ).map(({ id }) => id);

  const localToday = formatDateInTimeZone(now, context.timezone);
  const dateValue = new Date(`${input.date}T00:00:00.000Z`);
  const nextDate = addLocalDays(input.date, 1);
  const dayStart = zonedDateTimeToUtc(
    input.date,
    "00:00",
    context.timezone,
  );
  const dayEnd = zonedDateTimeToUtc(nextDate, "00:00", context.timezone);
  const dayOfWeek = localDayOfWeek(input.date);

  const location = await prisma.locations.findUnique({
    where: {
      id: context.locationId,
    },
    select: {
      location_booking_policies: {
        select: {
          slot_interval_minutes: true,
          minimum_lead_minutes: true,
          maximum_advance_days: true,
        },
      },
      location_business_hours: {
        where: {
          day_of_week: dayOfWeek,
          is_closed: false,
        },
        orderBy: {
          segment_index: "asc",
        },
        select: {
          opens_at: true,
          closes_at: true,
        },
      },
      location_services: {
        where: {
          service_variant_id: input.serviceVariantId,
          is_active: true,
          online_booking_enabled: true,
          services: {
            is_active: true,
            online_booking_enabled: true,
          },
          service_variants: {
            is_active: true,
          },
        },
        take: 1,
        select: {
          price_override_minor: true,
          duration_override_minutes: true,
          services: {
            select: {
              id: true,
              name: true,
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
          service_staff_assignments: {
            where: {
              is_active: true,
              online_booking_enabled: true,
              ...(input.staffProfileId
                ? { staff_profile_id: input.staffProfileId }
                : {}),
              staff_profiles: {
                is_active: true,
                public_visible: true,
                staff_location_assignments: {
                  some: {
                    location_id: context.locationId,
                    is_active: true,
                  },
                },
              },
            },
            orderBy: {
              staff_profiles: {
                sort_order: "asc",
              },
            },
            select: {
              staff_profiles: {
                select: {
                  id: true,
                  display_name: true,
                  title: true,
                  staff_availability_rules: {
                    where: {
                      location_id: context.locationId,
                      day_of_week: dayOfWeek,
                      is_active: true,
                      AND: [
                        {
                          OR: [
                            { effective_from: null },
                            { effective_from: { lte: dateValue } },
                          ],
                        },
                        {
                          OR: [
                            { effective_until: null },
                            { effective_until: { gte: dateValue } },
                          ],
                        },
                      ],
                    },
                    orderBy: {
                      segment_index: "asc",
                    },
                    select: {
                      starts_at: true,
                      ends_at: true,
                    },
                  },
                  staff_schedule_exceptions: {
                    where: {
                      location_id: context.locationId,
                      exception_date: dateValue,
                    },
                    select: {
                      kind: true,
                      starts_at: true,
                      ends_at: true,
                    },
                  },
                  staff_time_off: {
                    where: {
                      OR: [
                        { location_id: null },
                        { location_id: context.locationId },
                      ],
                      starts_at: { lt: dayEnd },
                      ends_at: { gt: dayStart },
                    },
                    select: {
                      starts_at: true,
                      ends_at: true,
                    },
                  },
                  booking_staff_allocations: {
                    where: {
                      location_id: context.locationId,
                      is_blocking: true,
                      starts_at: { lt: dayEnd },
                      ends_at: { gt: dayStart },
                      ...(ignoredHoldIds.length > 0
                        ? {
                            OR: [
                              { booking_hold_id: null },
                              {
                                booking_hold_id: {
                                  notIn: ignoredHoldIds,
                                },
                              },
                            ],
                          }
                        : {}),
                    },
                    select: {
                      starts_at: true,
                      ends_at: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      resources: {
        where: {
          is_active: true,
        },
        orderBy: {
          sort_order: "asc",
        },
        select: {
          id: true,
          resource_type_id: true,
          resource_availability_rules: {
            where: {
              day_of_week: dayOfWeek,
              is_active: true,
            },
            orderBy: {
              segment_index: "asc",
            },
            select: {
              starts_at: true,
              ends_at: true,
            },
          },
          resource_time_off: {
            where: {
              starts_at: { lt: dayEnd },
              ends_at: { gt: dayStart },
            },
            select: {
              starts_at: true,
              ends_at: true,
            },
          },
          booking_resource_allocations: {
            where: {
              location_id: context.locationId,
              is_blocking: true,
              starts_at: { lt: dayEnd },
              ends_at: { gt: dayStart },
              ...(ignoredHoldIds.length > 0
                ? {
                    OR: [
                      { booking_hold_id: null },
                      {
                        booking_hold_id: {
                          notIn: ignoredHoldIds,
                        },
                      },
                    ],
                  }
                : {}),
            },
            select: {
              starts_at: true,
              ends_at: true,
            },
          },
        },
      },
    },
  });

  const policy = location?.location_booking_policies;
  const locationService = location?.location_services[0];
  if (!location || !policy || !locationService) {
    throw new AppError("NOT_FOUND", "找不到可預約的服務。", 404);
  }

  const maximumDate = addLocalDays(
    localToday,
    policy.maximum_advance_days,
  );
  if (input.date < localToday || input.date > maximumDate) {
    throw new AppError(
      "BAD_REQUEST",
      "所選日期不在可預約範圍內。",
      400,
    );
  }

  const businessHours = location.location_business_hours.map((hours) => ({
    opensAt: databaseTimeToString(hours.opens_at),
    closesAt: databaseTimeToString(hours.closes_at),
  }));
  const variant = locationService.service_variants;
  const durationMinutes =
    locationService.duration_override_minutes ?? variant.duration_minutes;
  const priceMinor =
    locationService.price_override_minor ?? variant.price_minor;
  const notBefore = new Date(
    now.getTime() + policy.minimum_lead_minutes * 60_000,
  );
  const requirements =
    variant.service_resource_requirements.map((requirement) => ({
      resourceTypeId: requirement.resource_type_id,
      quantity: requirement.quantity,
    }));
  const resources: ResourceCandidate[] = location.resources.map(
    (resource) => ({
      id: resource.id,
      resourceTypeId: resource.resource_type_id,
      rules: resource.resource_availability_rules.map((rule) => ({
        opensAt: databaseTimeToString(rule.starts_at),
        closesAt: databaseTimeToString(rule.ends_at),
      })),
      busy: [
        ...resource.resource_time_off.map((timeOff) => ({
          startsAt: timeOff.starts_at,
          endsAt: timeOff.ends_at,
        })),
        ...resource.booking_resource_allocations.map((allocation) => ({
          startsAt: allocation.starts_at,
          endsAt: allocation.ends_at,
        })),
      ],
    }),
  );

  const staffSummaries = locationService.service_staff_assignments.map(
    ({ staff_profiles: staff }) => ({
      id: staff.id,
      displayName: staff.display_name,
      title: staff.title,
    }),
  );
  const slotsByStart = new Map<
    string,
    PublicAvailability["slots"][number]
  >();

  for (const { staff_profiles: staff } of locationService.service_staff_assignments) {
    const weeklyHours = staff.staff_availability_rules.map((rule) => ({
      opensAt: databaseTimeToString(rule.starts_at),
      closesAt: databaseTimeToString(rule.ends_at),
    }));
    const availableExceptions = staff.staff_schedule_exceptions
      .filter(
        (exception) =>
          exception.kind === "AVAILABLE" &&
          exception.starts_at &&
          exception.ends_at,
      )
      .map((exception) => ({
        opensAt: databaseTimeToString(exception.starts_at as Date),
        closesAt: databaseTimeToString(exception.ends_at as Date),
      }));
    const staffHours =
      availableExceptions.length > 0 ? availableExceptions : weeklyHours;
    const workingWindows = intersectLocalIntervals(
      businessHours,
      staffHours,
    );
    const unavailableExceptions = staff.staff_schedule_exceptions
      .filter((exception) => exception.kind === "UNAVAILABLE")
      .map((exception) => ({
        startsAt: exception.starts_at
          ? zonedDateTimeToUtc(
              input.date,
              databaseTimeToString(exception.starts_at),
              context.timezone,
            )
          : dayStart,
        endsAt: exception.ends_at
          ? zonedDateTimeToUtc(
              input.date,
              databaseTimeToString(exception.ends_at),
              context.timezone,
            )
          : dayEnd,
      }));
    const busyIntervals: BusyInterval[] = [
      ...staff.staff_time_off.map((timeOff) => ({
        startsAt: timeOff.starts_at,
        endsAt: timeOff.ends_at,
      })),
      ...staff.booking_staff_allocations.map((allocation) => ({
        startsAt: allocation.starts_at,
        endsAt: allocation.ends_at,
      })),
      ...unavailableExceptions,
    ];

    for (const workingWindow of workingWindows) {
      const generated = generateAvailableSlots({
        date: input.date,
        timeZone: context.timezone,
        opensAt: workingWindow.opensAt,
        closesAt: workingWindow.closesAt,
        durationMinutes,
        preBufferMinutes: variant.pre_buffer_minutes,
        postBufferMinutes: variant.post_buffer_minutes,
        intervalMinutes: policy.slot_interval_minutes,
        notBefore,
        busyIntervals,
      });

      for (const slot of generated) {
        const resourceIds = selectResources({
          requirements,
          candidates: resources,
          interval: {
            startsAt: slot.allocationStartsAt,
            endsAt: slot.allocationEndsAt,
          },
          localWindow: workingWindow,
          date: input.date,
          timezone: context.timezone,
        });
        if (requirements.length > 0 && !resourceIds) {
          continue;
        }

        const key = slot.startsAt.toISOString();
        const existing = slotsByStart.get(key);
        if (existing) {
          existing.availableStaff.push(staff.id);
        } else {
          slotsByStart.set(key, {
            startsAt: key,
            endsAt: slot.endsAt.toISOString(),
            localTime: slot.localTime,
            availableStaff: [staff.id],
          });
        }
      }
    }
  }

  return {
    date: input.date,
    timezone: context.timezone,
    service: {
      id: locationService.services.id,
      name: locationService.services.name,
      variantId: variant.id,
      variantName: variant.name,
      durationMinutes,
      priceMinor,
      currency: context.currency,
    },
    staff: staffSummaries,
    slots: [...slotsByStart.values()].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    ),
  };
}
