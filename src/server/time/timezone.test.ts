import { describe, expect, it } from "vitest";

import {
  formatDateInTimeZone,
  formatTimeInTimeZone,
  zonedDateTimeToUtc,
} from "./timezone";

describe("timezone conversion", () => {
  it("stores Taipei local times as UTC instants", () => {
    const value = zonedDateTimeToUtc(
      "2026-08-10",
      "10:30",
      "Asia/Taipei",
    );
    expect(value.toISOString()).toBe("2026-08-10T02:30:00.000Z");
    expect(formatDateInTimeZone(value, "Asia/Taipei")).toBe("2026-08-10");
    expect(formatTimeInTimeZone(value, "Asia/Taipei")).toBe("10:30");
  });

  it("uses the active daylight-saving offset", () => {
    expect(
      zonedDateTimeToUtc(
        "2026-07-15",
        "10:00",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-07-15T14:00:00.000Z");
    expect(
      zonedDateTimeToUtc(
        "2026-12-15",
        "10:00",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-12-15T15:00:00.000Z");
  });
});
