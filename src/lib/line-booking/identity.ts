import { verifyLineIdentity } from '@/server/auth/line-identity';

export async function verifyLine(store: {line_channel_id:string;line_provider_id:string}, bearer: string | null, nonce?: string): Promise<string> {
  if (!bearer?.startsWith('Bearer ')) throw Error('authentication required');
  if (!store.line_channel_id || !store.line_provider_id) throw Error('LINE channel not configured');
  if (!nonce) throw Error('invalid LINE identity');
  const identity=await verifyLineIdentity(bearer.slice(7),{channelId:store.line_channel_id,providerId:store.line_provider_id},nonce);
  return `${identity.providerId}:${identity.subject}`;
}
