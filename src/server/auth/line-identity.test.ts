import { describe, expect, it, vi } from "vitest";

import { verifyLineIdentity } from "./line-identity";

const channel = { channelId: "channel-1", providerId: "provider-1" };
const claims = { iss: "https://access.line.me", aud: "channel-1", sub: "U-test", nonce: "nonce-1", exp: Math.floor(Date.now() / 1000) + 600 };

describe("LINE identity verification", () => {
  it("accepts an ID token only for its configured channel and nonce", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(claims), { status: 200 }));
    await expect(verifyLineIdentity("id-token", channel, "nonce-1", fetcher)).resolves.toEqual({ providerId: "provider-1", subject: "U-test" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a wrong channel, issuer, nonce or expired token", async () => {
    for (const changed of [
      { aud: "other-channel" }, { iss: "https://example.com" },
      { nonce: "other-nonce" }, { exp: 1 },
    ]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...claims, ...changed }), { status: 200 }));
      await expect(verifyLineIdentity("id-token", channel, "nonce-1", fetcher)).rejects.toThrow("invalid LINE identity");
    }
  });
});
