import { beforeEach, expect, it, vi } from "vitest";
import type { OrganizationContext } from "../authorization/context";

const read = vi.hoisted(() => vi.fn());
const bookings = vi.hoisted(() => vi.fn());
vi.mock("../database/prisma", () => ({ prisma: {
  locations: { findUniqueOrThrow: read }, bookings: { findMany: bookings },
} }));
import { getMerchantWorkspaceData } from "./data";

const context: OrganizationContext = {
    session: { id: "session", profileId: "staff", email: "staff@example.test",
      displayName: "Staff", platformRole: null, expiresAt: new Date(), csrfTokenHash: "hash" },
    organization: { id: "tenant", slug: "tenant", name: "Tenant", status: "ACTIVE" },
    location: { id: "branch", slug: "branch", name: "Branch", timezone: "Asia/Taipei" },
    roles: new Set(["SERVICE_PROVIDER"]), allLocations: false,
    accessibleLocationIds: new Set(["branch"]), linkedStaffProfileId: null,
};
beforeEach(() => vi.clearAllMocks());

it("rejects own-booking reads without a linked staff identity before querying data", async () => {
  await expect(getMerchantWorkspaceData(context)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(read).not.toHaveBeenCalled();
});

it("scopes both booking selection and returned segments to the linked staff", async () => {
  const stopped = new Error("Query captured");
  bookings.mockImplementation(() => { throw stopped; });
  await expect(getMerchantWorkspaceData({ ...context, linkedStaffProfileId: "staff-a" })).rejects.toBe(stopped);
  expect(bookings).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ organization_id: "tenant", location_id: "branch",
      booking_segments: { some: expect.objectContaining({ assigned_staff_id: "staff-a" }) } }),
    select: expect.objectContaining({ booking_segments: expect.objectContaining({
      where: expect.objectContaining({ assigned_staff_id: "staff-a" }),
    }) }),
  }));
});

it("preserves location-wide reads for owners even without a staff link", async () => {
  const stopped = new Error("Query captured");
  bookings.mockImplementation(() => { throw stopped; });
  await expect(getMerchantWorkspaceData({ ...context, roles: new Set(["ORGANIZATION_OWNER"]) })).rejects.toBe(stopped);
  const query = bookings.mock.calls[0][0];
  expect(query.where).toMatchObject({ organization_id: "tenant", location_id: "branch" });
  expect(query.where.booking_segments.some).not.toHaveProperty("assigned_staff_id");
  expect(query.select.booking_segments).not.toHaveProperty("where");
});
