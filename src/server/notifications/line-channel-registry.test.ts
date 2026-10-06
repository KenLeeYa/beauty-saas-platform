import { describe, expect, it } from "vitest";

import { selectStoreLineChannel } from "./line-channel-selection";

const channels = [
  { organizationId: "org-a", locationId: "loc-a", channelId: "channel-a", providerId: "provider-a", enabled: true },
  { organizationId: "org-a", locationId: "loc-b", channelId: "channel-b", providerId: "provider-b", enabled: true },
  { organizationId: "org-b", locationId: "loc-c", channelId: "channel-c", providerId: "provider-c", enabled: false },
];

describe("store LINE channel selection", () => {
  it("selects only the exact tenant, location and channel", () => {
    expect(selectStoreLineChannel(channels, "org-a", "loc-b", "channel-b")?.providerId).toBe("provider-b");
    expect(selectStoreLineChannel(channels, "org-a", "loc-a", "channel-b")).toBeNull();
    expect(selectStoreLineChannel(channels, "org-b", "loc-a", "channel-a")).toBeNull();
  });

  it("does not accept a disabled channel", () => {
    expect(selectStoreLineChannel(channels, "org-b", "loc-c", "channel-c")).toBeNull();
  });
});
