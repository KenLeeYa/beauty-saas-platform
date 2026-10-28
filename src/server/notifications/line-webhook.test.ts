import { describe, expect, it } from "vitest";

import {
  createLineSignature,
  isFreshLineEvent,
  verifyLineSignature,
} from "./line-security";

describe("LINE webhook security", () => {
  it("verifies a signature against the unmodified raw body", () => {
    const body = '{"events":[]}';
    const secret = "test-line-channel-secret";
    const signature = createLineSignature(body, secret);

    expect(
      verifyLineSignature({
        body,
        secret,
        signature,
      }),
    ).toBe(true);
    expect(
      verifyLineSignature({
        body: `${body}\n`,
        secret,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects stale and future replay events", () => {
    const now = new Date("2026-07-28T08:00:00.000Z");

    expect(isFreshLineEvent(now.getTime() - 14 * 60_000, now)).toBe(
      true,
    );
    expect(isFreshLineEvent(now.getTime() - 16 * 60_000, now)).toBe(
      false,
    );
    expect(isFreshLineEvent(now.getTime() + 16 * 60_000, now)).toBe(
      false,
    );
  });
});
