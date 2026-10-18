import { describe, expect, it } from "vitest";

import {
  canTransitionBooking,
  nextBookingStatuses,
} from "./state-machine";

describe("booking state machine", () => {
  it("requires explicit operational steps", () => {
    expect(canTransitionBooking("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransitionBooking("CHECKED_IN", "IN_SERVICE")).toBe(true);
    expect(canTransitionBooking("IN_SERVICE", "COMPLETED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "COMPLETED")).toBe(false);
  });

  it("keeps terminal states terminal", () => {
    for (const status of [
      "COMPLETED",
      "NO_SHOW",
      "CANCELLED",
      "EXPIRED",
      "RESCHEDULED",
    ] as const) {
      expect(nextBookingStatuses(status)).toEqual([]);
    }
  });

  it("expires only pending-payment bookings", () => {
    expect(canTransitionBooking("PENDING_PAYMENT", "EXPIRED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "EXPIRED")).toBe(false);
  });
});
