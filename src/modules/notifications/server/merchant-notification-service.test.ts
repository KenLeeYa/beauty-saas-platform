import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../../../server/authorization/capabilities";
import type { OrganizationContext } from "../../../server/authorization/context";

const mocks = vi.hoisted(() => ({
  findDelivery: vi.fn(),
  updateJob: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/database/prisma", () => ({
  prisma: {
    $transaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
    ) =>
      callback({
        notification_deliveries: { findFirst: mocks.findDelivery },
        notification_jobs: { updateMany: mocks.updateJob },
        audit_logs: { create: mocks.createAudit },
      }),
  },
}));

import { retryMerchantNotification } from "./merchant-notification-service";

function contextFor(roles: Role[]): OrganizationContext {
  return {
    session: {
      id: "session-1",
      profileId: "profile-1",
      email: "manager@example.test",
      displayName: "Manager",
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
    roles: new Set(roles),
    allLocations: false,
    accessibleLocationIds: new Set(["location-1"]),
    linkedStaffProfileId: null,
  };
}

describe("merchant notification retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDelivery.mockResolvedValue({
      notification_job_id: "job-1",
      notification_jobs: {
        status: "DEAD_LETTER",
        attempt_count: 5,
      },
    });
    mocks.updateJob.mockResolvedValue({ count: 1 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("scopes retries to the verified organization and location", async () => {
    const now = new Date("2026-08-09T03:00:00.000Z");
    const result = await retryMerchantNotification({
      context: contextFor(["LOCATION_MANAGER"]),
      deliveryId: "delivery-1",
      requestId: "request-1",
      now,
    });

    expect(mocks.findDelivery).toHaveBeenCalledWith({
      where: {
        id: "delivery-1",
        organization_id: "organization-1",
        notification_jobs: {
          notification_outbox: { location_id: "location-1" },
        },
      },
      select: {
        notification_job_id: true,
        notification_jobs: {
          select: { status: true, attempt_count: true },
        },
      },
    });
    expect(mocks.updateJob).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        organization_id: "organization-1",
        status: "DEAD_LETTER",
      },
      data: {
        status: "PENDING",
        attempt_count: 0,
        next_attempt_at: now,
        completed_at: null,
        locked_at: null,
        locked_by: null,
      },
    });
    expect(result).toEqual({
      jobId: "job-1",
      status: "PENDING",
      nextAttemptAt: now.toISOString(),
    });
  });

  it("does not retry a delivery outside the selected location", async () => {
    mocks.findDelivery.mockResolvedValue(null);

    await expect(
      retryMerchantNotification({
        context: contextFor(["LOCATION_MANAGER"]),
        deliveryId: "other-delivery",
        requestId: "request-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.updateJob).not.toHaveBeenCalled();
  });

  it("blocks service providers from retrying merchant notifications", async () => {
    await expect(
      retryMerchantNotification({
        context: contextFor(["SERVICE_PROVIDER"]),
        deliveryId: "delivery-1",
        requestId: "request-3",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.findDelivery).not.toHaveBeenCalled();
  });
});
