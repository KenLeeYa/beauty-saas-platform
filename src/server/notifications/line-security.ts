import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_EVENT_AGE_MS = 15 * 60 * 1000;

export function createLineSignature(body: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
}

export function verifyLineSignature(input: {
  body: string;
  secret: string;
  signature: string;
}): boolean {
  if (!input.secret || !input.signature) {
    return false;
  }

  const expected = Buffer.from(
    createLineSignature(input.body, input.secret),
    "utf8",
  );
  const actual = Buffer.from(input.signature, "utf8");
  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

export function isFreshLineEvent(
  timestamp: number,
  now = new Date(),
): boolean {
  return Math.abs(now.getTime() - timestamp) <= MAX_EVENT_AGE_MS;
}
