import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../../../server/authorization/capabilities";
import type { OrganizationContext } from "../../../server/authorization/context";

const mocks = vi.hoisted(() => ({
  requireEntitlement: vi.fn(),
  findCustomer: vi.fn(),
  findTag: vi.fn(),
  createAssignments: vi.fn(),
  deleteAssignments: vi.fn(),
  createNote: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/entitlements/service", () => ({
  requireEntitlement: mocks.requireEntitlement,
}));
vi.mock("../../../server/database/prisma", () => ({
  prisma: {
    $transaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
    ) =>
      callback({
        customers: { findFirst: mocks.findCustomer },
        customer_tags: { findFirst: mocks.findTag },
        customer_tag_assignments: {
          createMany: mocks.createAssignments,
          deleteMany: mocks.deleteAssignments,
        },
        customer_notes: { create: mocks.createNote },
        audit_logs: { create: mocks.createAudit },
      }),
  },
}));

import {
  createCustomerNote,
  setCustomerTagAssignment,
} from "./customer-service";

function contextFor(roles: Role[]): OrganizationContext {
  return {
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
    roles: new Set(roles),
    allLocations: true,
    accessibleLocationIds: new Set(["location-1"]),
    linkedStaffProfileId: null,
  };
}

describe("CRM customer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEntitlement.mockResolvedValue(undefined);
    mocks.findCustomer.mockResolvedValue({ id: "customer-1" });
    mocks.findTag.mockResolvedValue({ id: "tag-1" });
    mocks.createAssignments.mockResolvedValue({ count: 1 });
    mocks.deleteAssignments.mockResolvedValue({ count: 1 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
    mocks.createNote.mockResolvedValue({
      id: "note-1",
      created_at: new Date("2026-08-09T02:00:00.000Z"),
    });
  });

  it("verifies organization scope before assigning a customer tag", async () => {
    await setCustomerTagAssignment({
      context: contextFor(["ORGANIZATION_OWNER"]),
      customerId: "customer-1",
      tagId: "tag-1",
      assigned: true,
      requestId: "request-1",
    });

    expect(mocks.findCustomer).toHaveBeenCalledWith({
      where: {
        id: "customer-1",
        organization_id: "organization-1",
        is_active: true,
      },
      select: { id: true },
    });
    expect(mocks.findTag).toHaveBeenCalledWith({
      where: { id: "tag-1", organization_id: "organization-1" },
      select: { id: true },
    });
    expect(mocks.createAssignments).toHaveBeenCalledWith({
      data: [
        {
          organization_id: "organization-1",
          customer_id: "customer-1",
          tag_id: "tag-1",
          assigned_by: "profile-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("does not assign a tag when the customer is outside the organization", async () => {
    mocks.findCustomer.mockResolvedValue(null);

    await expect(
      setCustomerTagAssignment({
        context: contextFor(["ORGANIZATION_OWNER"]),
        customerId: "other-customer",
        tagId: "tag-1",
        assigned: true,
        requestId: "request-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.createAssignments).not.toHaveBeenCalled();
  });

  it("keeps note content out of the audit payload", async () => {
    const noteText = "顧客偏好安靜且不使用香氛。";
    await createCustomerNote({
      context: contextFor(["ORGANIZATION_OWNER"]),
      customerId: "customer-1",
      note: noteText,
      sensitivity: "SENSITIVE",
      requestId: "request-3",
    });

    expect(mocks.createNote).toHaveBeenCalledWith({
      data: {
        organization_id: "organization-1",
        customer_id: "customer-1",
        note: noteText,
        sensitivity: "SENSITIVE",
        created_by: "profile-1",
      },
      select: { id: true, created_at: true },
    });
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after_json: {
            customerId: "customer-1",
            sensitivity: "SENSITIVE",
            noteLength: noteText.length,
          },
        }),
      }),
    );
  });

  it("blocks sensitive notes for front desk roles", async () => {
    await expect(
      createCustomerNote({
        context: contextFor(["FRONT_DESK"]),
        customerId: "customer-1",
        note: "敏感內容",
        sensitivity: "SENSITIVE",
        requestId: "request-4",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createNote).not.toHaveBeenCalled();
  });
});
