import { describe, expect, it } from "vitest";

import {
  formatLocalDateKey,
  formatLocalDateTime,
  formatLocalMonthDayTime,
  formatLocalTime,
} from "./date-time";

describe("deterministic local date presentation", () => {
  it("formats full date-time values with fixed ASCII separators", () => {
    expect(
      formatLocalDateTime("2026-08-09T08:19:00.000Z", "Asia/Taipei"),
    ).toBe("2026/08/09 16:19");
  });

  it("formats notification timestamps without locale-specific whitespace", () => {
    expect(
      formatLocalMonthDayTime(
        "2026-08-09T08:19:00.000Z",
        "Asia/Taipei",
      ),
    ).toBe("8/9 16:19");
  });

  it("formats date keys and times without locale-dependent punctuation", () => {
    const value = "2026-08-09T16:05:00.000Z";
    expect(formatLocalDateKey(value, "Asia/Taipei")).toBe("2026-08-10");
    expect(formatLocalTime(value, "Asia/Taipei")).toBe("00:05");
  });
});
