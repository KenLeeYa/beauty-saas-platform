import { describe, expect, it } from "vitest";

import {
  calculateCancellationFeeMinor,
  calculateDepositMinor,
} from "./pricing";

describe("booking pricing policies", () => {
  it("caps fixed deposits at the booking total", () => {
    expect(
      calculateDepositMinor(30_000, {
        mode: "FIXED",
        fixedAmountMinor: 50_000,
      }),
    ).toBe(30_000);
  });

  it("rounds percentage deposits in minor units", () => {
    expect(
      calculateDepositMinor(199_00, {
        mode: "PERCENTAGE",
        percentage: 30,
      }),
    ).toBe(5_970);
  });

  it("does not charge within the free cancellation window", () => {
    expect(
      calculateCancellationFeeMinor({
        totalMinor: 180_000,
        depositPaidMinor: 50_000,
        startsAt: new Date("2026-08-10T02:00:00Z"),
        cancelledAt: new Date("2026-08-08T01:00:00Z"),
        policy: {
          freeCancellationHours: 24,
          lateFee: { mode: "DEPOSIT_FORFEIT" },
        },
      }),
    ).toBe(0);
  });

  it("forfeits only the paid deposit for a late cancellation", () => {
    expect(
      calculateCancellationFeeMinor({
        totalMinor: 180_000,
        depositPaidMinor: 50_000,
        startsAt: new Date("2026-08-10T02:00:00Z"),
        cancelledAt: new Date("2026-08-09T12:00:00Z"),
        policy: {
          freeCancellationHours: 24,
          lateFee: { mode: "DEPOSIT_FORFEIT" },
        },
      }),
    ).toBe(50_000);
  });
});
