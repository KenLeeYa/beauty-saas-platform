import { z } from "zod";

const claimsSchema = z.object({
  iss: z.literal("https://access.line.me"),
  aud: z.string().min(1),
  sub: z.string().min(1),
  nonce: z.string().min(1),
  exp: z.number().int().positive(),
});

export type VerifiedLineIdentity = { providerId: string; subject: string };

export async function verifyLineIdentity(
  idToken: string,
  expectedChannel: { channelId: string; providerId: string },
  nonce: string,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedLineIdentity> {
  if (!idToken || !nonce || !expectedChannel.channelId || !expectedChannel.providerId) {
    throw new Error("invalid LINE identity");
  }
  const response = await fetcher("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: expectedChannel.channelId }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("invalid LINE identity");
  const parsed = claimsSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.aud !== expectedChannel.channelId ||
      parsed.data.nonce !== nonce || parsed.data.exp * 1000 <= Date.now()) {
    throw new Error("invalid LINE identity");
  }
  return { providerId: expectedChannel.providerId, subject: parsed.data.sub };
}
