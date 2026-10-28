import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "../../../server/authorization/context";
import { AppError } from "../../../server/http/errors";

const mocks = vi.hoisted(() => ({
  module: vi.fn(), entitlement: vi.fn(), customer: vi.fn(),
  execute: vi.fn(), query: vi.fn(), audit: vi.fn(),
}));
vi.mock("../../../server/entitlements/module-visibility", () => ({ requireModule: mocks.module }));
vi.mock("../../../server/entitlements/service", () => ({ requireEntitlement: mocks.entitlement }));
vi.mock("../../../server/database/prisma", () => ({ prisma: {
  $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
    customers: { findFirst: mocks.customer }, $executeRaw: mocks.execute,
    $queryRaw: mocks.query, audit_logs: { create: mocks.audit },
  }),
} }));
import { setCustomerStatus } from "./customer-status";

const context: OrganizationContext = {
  session: { id: "session", profileId: "owner", email: "owner@example.test",
    displayName: "Owner", platformRole: null, expiresAt: new Date(), csrfTokenHash: "hash" },
  organization: { id: "tenant-a", slug: "a", name: "A", status: "ACTIVE" },
  location: { id: "branch-a", slug: "a", name: "A", timezone: "Asia/Taipei" },
  roles: new Set(["ORGANIZATION_OWNER"]), allLocations: true,
  accessibleLocationIds: new Set(["branch-a"]), linkedStaffProfileId: null,
};
const command = { context, customerId: "customer-a", scope: "LOCATION" as const,
  statusKind: "BLACKLIST" as const, enabled: true, reason: "Synthetic review", requestId: "request" };

describe("customer status authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.customer.mockResolvedValue({ id: command.customerId });
    mocks.query.mockResolvedValue([{ id: "rule" }]);
  });

  it.each([true, false])("requires the paid add-on for blacklist enabled=%s", async enabled => {
    mocks.entitlement.mockRejectedValue(new AppError("FEATURE_UNAVAILABLE", "Unavailable", 403));
    await expect(setCustomerStatus({ ...command, enabled })).rejects.toMatchObject({ status: 403 });
    expect(mocks.entitlement).toHaveBeenCalledWith("tenant-a", "CUSTOMER_BLACKLIST");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("requires CRM activation even for VIP writes", async () => {
    mocks.module.mockRejectedValue(new AppError("FEATURE_UNAVAILABLE", "Unavailable", 403));
    await expect(setCustomerStatus({ ...command, statusKind: "VIP" })).rejects.toMatchObject({ status: 403 });
    expect(mocks.module).toHaveBeenCalledWith(context, "CUSTOMER_CRM");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("keeps VIP independent from the blacklist add-on", async () => {
    await setCustomerStatus({ ...command, statusKind: "VIP" });
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("allows paid blacklist writes and scopes the customer lookup", async () => {
    await setCustomerStatus(command);
    expect(mocks.entitlement).toHaveBeenCalledWith("tenant-a", "CUSTOMER_BLACKLIST");
    expect(mocks.customer).toHaveBeenCalledWith({ where: {
      id: "customer-a", organization_id: "tenant-a", is_active: true,
    }, select: { id: true } });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("rejects a foreign customer without status events", async () => {
    mocks.customer.mockResolvedValue(null);
    await expect(setCustomerStatus(command)).rejects.toMatchObject({ status: 404 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["LOCATION", "ORGANIZATION"] as const)("denies provider writes in %s scope", async scope => {
    await expect(setCustomerStatus({ ...command, scope,
      context: { ...context, roles: new Set(["SERVICE_PROVIDER"]) },
    })).rejects.toMatchObject({ status: 403 });
    expect(mocks.customer).not.toHaveBeenCalled();
  });
});
