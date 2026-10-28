import { formatTimeInTimeZone, zonedDateTimeToUtc } from "../time/timezone";

export type BusyInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type GeneratedSlot = {
  startsAt: Date;
  endsAt: Date;
  allocationStartsAt: Date;
  allocationEndsAt: Date;
  localTime: string;
};

function overlaps(left: BusyInterval, right: BusyInterval): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

function ceilToInterval(date: Date, intervalMinutes: number): Date {
  const intervalMs = intervalMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs);
}

export function generateAvailableSlots(input: {
  date: string;
  timeZone: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  preBufferMinutes: number;
  postBufferMinutes: number;
  intervalMinutes: number;
  notBefore: Date;
  busyIntervals: readonly BusyInterval[];
}): GeneratedSlot[] {
  const opensAt = zonedDateTimeToUtc(
    input.date,
    input.opensAt,
    input.timeZone,
  );
  const closesAt = zonedDateTimeToUtc(
    input.date,
    input.closesAt,
    input.timeZone,
  );
  const firstServiceStart = new Date(
    opensAt.getTime() + input.preBufferMinutes * 60_000,
  );
  let candidate = ceilToInterval(
    new Date(
      Math.max(firstServiceStart.getTime(), input.notBefore.getTime()),
    ),
    input.intervalMinutes,
  );
  const slots: GeneratedSlot[] = [];

  while (candidate < closesAt) {
    const serviceEndsAt = new Date(
      candidate.getTime() + input.durationMinutes * 60_000,
    );
    const allocationStartsAt = new Date(
      candidate.getTime() - input.preBufferMinutes * 60_000,
    );
    const allocationEndsAt = new Date(
      serviceEndsAt.getTime() + input.postBufferMinutes * 60_000,
    );
    const interval = {
      startsAt: allocationStartsAt,
      endsAt: allocationEndsAt,
    };

    if (
      allocationStartsAt >= opensAt &&
      allocationEndsAt <= closesAt &&
      !input.busyIntervals.some((busy) => overlaps(interval, busy))
    ) {
      slots.push({
        startsAt: candidate,
        endsAt: serviceEndsAt,
        allocationStartsAt,
        allocationEndsAt,
        localTime: formatTimeInTimeZone(candidate, input.timeZone),
      });
    }

    candidate = new Date(
      candidate.getTime() + input.intervalMinutes * 60_000,
    );
  }

  return slots;
}
