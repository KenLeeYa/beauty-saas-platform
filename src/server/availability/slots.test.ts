import { describe, expect, it } from "vitest";

import { generateAvailableSlots } from "./slots";

describe("availability slot generation", () => {
  it("honors buffers, interval and half-open busy ranges", () => {
    const slots = generateAvailableSlots({
      date: "2026-08-10",
      timeZone: "Asia/Taipei",
      opensAt: "10:00",
      closesAt: "13:00",
      durationMinutes: 60,
      preBufferMinutes: 15,
      postBufferMinutes: 15,
      intervalMinutes: 15,
      notBefore: new Date("2026-08-01T00:00:00Z"),
      busyIntervals: [
        {
          startsAt: new Date("2026-08-10T03:30:00Z"),
          endsAt: new Date("2026-08-10T04:15:00Z"),
        },
      ],
    });

    expect(slots.map((slot) => slot.localTime)).toEqual(["10:15"]);
  });

  it("respects a lead-time boundary", () => {
    const slots = generateAvailableSlots({
      date: "2026-08-10",
      timeZone: "Asia/Taipei",
      opensAt: "10:00",
      closesAt: "12:00",
      durationMinutes: 30,
      preBufferMinutes: 0,
      postBufferMinutes: 0,
      intervalMinutes: 15,
      notBefore: new Date("2026-08-10T02:37:00Z"),
      busyIntervals: [],
    });

    expect(slots[0]?.localTime).toBe("10:45");
  });
});
