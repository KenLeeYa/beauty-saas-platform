export const merchantApplicationStatuses = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_REVIEW",
  "NEEDS_INFO",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;

export type MerchantApplicationStatus =
  (typeof merchantApplicationStatuses)[number];

const transitions: Readonly<
  Record<MerchantApplicationStatus, ReadonlySet<MerchantApplicationStatus>>
> = {
  DRAFT: new Set(["SUBMITTED", "WITHDRAWN"]),
  SUBMITTED: new Set(["PENDING_REVIEW", "WITHDRAWN"]),
  PENDING_REVIEW: new Set(["NEEDS_INFO", "APPROVED", "REJECTED"]),
  NEEDS_INFO: new Set(["SUBMITTED", "WITHDRAWN"]),
  APPROVED: new Set(),
  REJECTED: new Set(),
  WITHDRAWN: new Set(),
  EXPIRED: new Set(),
};

export function canTransitionMerchantApplication(
  current: MerchantApplicationStatus,
  next: MerchantApplicationStatus,
): boolean {
  return transitions[current].has(next);
}

export function isApplicantEditableStatus(
  status: MerchantApplicationStatus,
): boolean {
  return status === "DRAFT" || status === "NEEDS_INFO";
}

export function isTerminalApplicationStatus(
  status: MerchantApplicationStatus,
): boolean {
  return ["APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED"].includes(
    status,
  );
}
