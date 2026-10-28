export type DepositPolicy =
  | { mode: "NONE" }
  | { mode: "FIXED"; fixedAmountMinor: number }
  | { mode: "PERCENTAGE"; percentage: number };

export type CancellationFeePolicy = {
  freeCancellationHours: number;
  lateFee:
    | { mode: "NONE" }
    | { mode: "FIXED"; fixedAmountMinor: number }
    | { mode: "PERCENTAGE"; percentage: number }
    | { mode: "DEPOSIT_FORFEIT" };
};

function percentageOf(amountMinor: number, percentage: number): number {
  return Math.round((amountMinor * percentage) / 100);
}

export function calculateDepositMinor(
  totalMinor: number,
  policy: DepositPolicy,
): number {
  if (policy.mode === "NONE") {
    return 0;
  }

  const calculated =
    policy.mode === "FIXED"
      ? policy.fixedAmountMinor
      : percentageOf(totalMinor, policy.percentage);

  return Math.min(totalMinor, Math.max(0, calculated));
}

export function calculateCancellationFeeMinor(input: {
  totalMinor: number;
  depositPaidMinor: number;
  startsAt: Date;
  cancelledAt: Date;
  policy: CancellationFeePolicy;
}): number {
  const hoursUntilStart =
    (input.startsAt.getTime() - input.cancelledAt.getTime()) / 3_600_000;
  if (hoursUntilStart >= input.policy.freeCancellationHours) {
    return 0;
  }

  const fee = (() => {
    switch (input.policy.lateFee.mode) {
      case "NONE":
        return 0;
      case "FIXED":
        return input.policy.lateFee.fixedAmountMinor;
      case "PERCENTAGE":
        return percentageOf(
          input.totalMinor,
          input.policy.lateFee.percentage,
        );
      case "DEPOSIT_FORFEIT":
        return input.depositPaidMinor;
    }
  })();

  return Math.min(input.totalMinor, Math.max(0, fee));
}
