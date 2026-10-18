import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationContext } from "../authorization/context";
import type { Role } from "../authorization/capabilities";

const databaseMocks = vi.hoisted(() => ({
  findLocationService: vi.fn(),
  updateServiceVariant: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../database/prisma", () => ({
  prisma: {
    $transaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
    ) =>
      callback({
        location_services: {
          findFirst: databaseMocks.findLocationService,
        },
        service_variants: {
          updateMany: databaseMocks.updateServiceVariant,
        },
        audit_logs: {
          create: databaseMocks.createAuditLog,
        },
      }),
  },
}));

import { updateMerchantServiceBuffers } from "./management";

const context: OrganizationContext = {
  session: {
    id: "session-1",
    profileId: "profile-1",
    email: "owner@example.test",
    displayName: "Owner",
    platformRole: null,
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    csrfTokenHash: "csrf-hash",
  },
  organization: {
    id: "organization-1",
    slug: "organization-a",
    name: "Organization A",
    status: "ACTIVE",
  },
  location: {
    id: "location-1",
    slug: "location-a",
    name: "Location A",
    timezone: "Asia/Taipei",
  },
  roles: new Set<Role>(["ORGANIZATION_OWNER"]),
  allLocations: true,
  accessibleLocationIds: new Set(["location-1"]),
  linkedStaffProfileId: null,
};

describe("merchant service management scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.findLocationService.mockResolvedValue({
      service_variant_id: "variant-1",
    });
    databaseMocks.updateServiceVariant.mockResolvedValue({ count: 1 });
    databaseMocks.createAuditLog.mockResolvedValue({ id: "audit-1" });
  });

  it("scopes buffer updates to the verified organization and location", async () => {
    await updateMerchantServiceBuffers({
      context,
      locationServiceId: "location-service-1",
      preBufferMinutes: 15,
      postBufferMinutes: 10,
      requestId: "request-1",
    });

    expect(databaseMocks.findLocationService).toHaveBeenCalledWith({
      where: {
        id: "location-service-1",
        organization_id: "organization-1",
        location_id: "location-1",
      },
      select: {
        service_variant_id: true,
      },
    });
    expect(databaseMocks.updateServiceVariant).toHaveBeenCalledWith({
      where: {
        id: "variant-1",
        organization_id: "organization-1",
      },
      data: {
        pre_buffer_minutes: 15,
        post_buffer_minutes: 10,
      },
    });
  });

  it("does not update a service outside the verified branch", async () => {
    databaseMocks.findLocationService.mockResolvedValue(null);

    await expect(
      updateMerchantServiceBuffers({
        context,
        locationServiceId: "other-location-service",
        preBufferMinutes: 15,
        postBufferMinutes: 10,
        requestId: "request-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(databaseMocks.updateServiceVariant).not.toHaveBeenCalled();
  });
});
