import { capabilitiesForRoles, type Capability, type Role } from "../authorization/capabilities";

export type MobileSessionSnapshot = {
  sessionId: string;
  organizationId: string;
  locationId: string;
  sessionExpiresAt: Date;
  sessionRevokedAt: Date | null;
  linkRevokedAt: Date | null;
  actorKind: "CUSTOMER" | "EMPLOYEE";
  profileId: string | null;
  customerId: string | null;
  customerActive: boolean;
  profileActive: boolean;
  memberships: readonly {
    role: Role;
    organizationId: string;
    locationId: string | null;
    active: boolean;
    allLocations: boolean;
  }[];
};

export type VerifiedMobileActor = {
  kind: "employee" | "customer";
  sessionId: string;
  organizationId: string;
  locationId: string;
  profileId: string | null;
  customerId: string | null;
  capabilities: ReadonlySet<Capability>;
};

export function resolveVerifiedMobileActor(
  snapshot: MobileSessionSnapshot,
  organizationId: string,
  locationId: string,
  now = new Date(),
): VerifiedMobileActor | null {
  if (snapshot.organizationId !== organizationId || snapshot.locationId !== locationId ||
      snapshot.sessionRevokedAt || snapshot.linkRevokedAt || snapshot.sessionExpiresAt <= now) return null;

  if (snapshot.actorKind === "CUSTOMER") {
    if (!snapshot.customerId || snapshot.profileId || !snapshot.customerActive) return null;
    return { kind: "customer", sessionId: snapshot.sessionId, organizationId, locationId,
      profileId: null, customerId: snapshot.customerId, capabilities: new Set<Capability>() };
  }
  if (!snapshot.profileId || snapshot.customerId || !snapshot.profileActive) return null;
  const roles = snapshot.memberships.filter((membership) =>
    membership.active && membership.organizationId === organizationId &&
    (membership.allLocations || membership.locationId === locationId)
  ).map((membership) => membership.role);
  if (!roles.length) return null;
  return { kind: "employee", sessionId: snapshot.sessionId, organizationId, locationId,
    profileId: snapshot.profileId, customerId: null, capabilities: capabilitiesForRoles(roles) };
}
