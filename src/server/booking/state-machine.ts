export const bookingStatuses = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
  "EXPIRED",
  "RESCHEDULED",
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

const transitions: Readonly<
  Record<BookingStatus, ReadonlySet<BookingStatus>>
> = {
  PENDING_PAYMENT: new Set(["CONFIRMED", "CANCELLED", "EXPIRED"]),
  CONFIRMED: new Set([
    "CHECKED_IN",
    "NO_SHOW",
    "CANCELLED",
    "RESCHEDULED",
  ]),
  CHECKED_IN: new Set(["IN_SERVICE", "CANCELLED"]),
  IN_SERVICE: new Set(["COMPLETED", "CANCELLED"]),
  COMPLETED: new Set(),
  NO_SHOW: new Set(),
  CANCELLED: new Set(),
  EXPIRED: new Set(),
  RESCHEDULED: new Set(),
};

export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return transitions[from].has(to);
}

export function nextBookingStatuses(
  status: BookingStatus,
): readonly BookingStatus[] {
  return [...transitions[status]];
}
