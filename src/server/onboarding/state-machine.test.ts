import { describe, expect, it } from "vitest";

import {
  canTransitionMerchantApplication,
  isApplicantEditableStatus,
  isTerminalApplicationStatus,
} from "./state-machine";

describe("merchant application state machine", () => {
  it("allows the applicant and reviewer happy path", () => {
    expect(canTransitionMerchantApplication("DRAFT", "SUBMITTED")).toBe(
      true,
    );
    expect(
      canTransitionMerchantApplication("SUBMITTED", "PENDING_REVIEW"),
    ).toBe(true);
    expect(
      canTransitionMerchantApplication("PENDING_REVIEW", "APPROVED"),
    ).toBe(true);
  });

  it("requires a new review after applicant resubmission", () => {
    expect(
      canTransitionMerchantApplication("PENDING_REVIEW", "NEEDS_INFO"),
    ).toBe(true);
    expect(
      canTransitionMerchantApplication("NEEDS_INFO", "SUBMITTED"),
    ).toBe(true);
    expect(
      canTransitionMerchantApplication("NEEDS_INFO", "APPROVED"),
    ).toBe(false);
  });

  it("keeps terminal states immutable", () => {
    for (const status of [
      "APPROVED",
      "REJECTED",
      "WITHDRAWN",
      "EXPIRED",
    ] as const) {
      expect(isTerminalApplicationStatus(status)).toBe(true);
      expect(
        canTransitionMerchantApplication(status, "SUBMITTED"),
      ).toBe(false);
    }
  });

  it("only lets applicants edit drafts and requested supplements", () => {
    expect(isApplicantEditableStatus("DRAFT")).toBe(true);
    expect(isApplicantEditableStatus("NEEDS_INFO")).toBe(true);
    expect(isApplicantEditableStatus("SUBMITTED")).toBe(false);
    expect(isApplicantEditableStatus("PENDING_REVIEW")).toBe(false);
  });
});
