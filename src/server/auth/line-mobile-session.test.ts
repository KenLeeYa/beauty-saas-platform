import { expect, it } from "vitest";

import { resolveVerifiedMobileActor } from "./line-mobile-session";

const base = {
  sessionId: "session-1", organizationId: "org-1", locationId: "loc-1",
  sessionExpiresAt: new Date("2030-01-02"), sessionRevokedAt: null,
  linkRevokedAt: null, actorKind: "EMPLOYEE" as const,
  profileId: "profile-1", customerId: null, profileActive: true, customerActive: true,
  memberships: [{ role: "FRONT_DESK" as const, organizationId: "org-1", locationId: "loc-1", active: true, allLocations: false }],
};

it("grants a proved employee only active membership capabilities in the selected store", () => {
  const actor = resolveVerifiedMobileActor(base, "org-1", "loc-1", new Date("2030-01-01"));
  expect(actor?.capabilities.has("booking.create")).toBe(true);
  expect(resolveVerifiedMobileActor(base, "org-1", "loc-2", new Date("2030-01-01"))).toBeNull();
});

it("revokes only the selected device session and rejects inactive employees", () => {
  expect(resolveVerifiedMobileActor({ ...base, sessionRevokedAt: new Date() }, "org-1", "loc-1", new Date("2030-01-01"))).toBeNull();
  expect(resolveVerifiedMobileActor({ ...base, profileActive: false }, "org-1", "loc-1", new Date("2030-01-01"))).toBeNull();
  expect(resolveVerifiedMobileActor({ ...base, memberships: [] }, "org-1", "loc-1", new Date("2030-01-01"))).toBeNull();
  expect(resolveVerifiedMobileActor(base, "org-1", "loc-1", new Date("2030-01-03"))).toBeNull();
});

it("keeps customer and employee links separate", () => {
  const customer = resolveVerifiedMobileActor({ ...base, actorKind: "CUSTOMER", customerId: "customer-1", profileId: null, memberships: [] }, "org-1", "loc-1", new Date("2030-01-01"));
  expect(customer?.kind).toBe("customer");
  expect(customer?.capabilities.size).toBe(0);
  expect(resolveVerifiedMobileActor({ ...base, actorKind: "CUSTOMER", customerId: "customer-1", profileId: null, customerActive: false, memberships: [] }, "org-1", "loc-1", new Date("2030-01-01"))).toBeNull();
  expect(resolveVerifiedMobileActor({ ...base, actorKind: "CUSTOMER", customerId: null }, "org-1", "loc-1", new Date("2030-01-01"))).toBeNull();
});
