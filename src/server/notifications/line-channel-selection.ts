export type StoreLineChannel = {
  organizationId: string;
  locationId: string;
  channelId: string;
  providerId: string;
  enabled: boolean;
};

export function selectStoreLineChannel(
  channels: readonly StoreLineChannel[],
  organizationId: string,
  locationId: string,
  channelId: string,
): StoreLineChannel | null {
  return channels.find((channel) =>
    channel.enabled &&
    channel.organizationId === organizationId &&
    channel.locationId === locationId &&
    channel.channelId === channelId
  ) ?? null;
}
