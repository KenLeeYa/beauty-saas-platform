export const roles = [
  "PLATFORM_ADMIN",
  "ORGANIZATION_OWNER",
  "ORGANIZATION_ADMIN",
  "FINANCE_VIEWER",
  "LOCATION_MANAGER",
  "FRONT_DESK",
  "SERVICE_PROVIDER",
] as const;

export type Role = (typeof roles)[number];

export const capabilities = [
  "platform.manage",
  "organization.manage",
  "location.manage",
  "subscription.read",
  "subscription.manage",
  "billing.read",
  "billing.manage",
  "team.read",
  "team.manage",
  "catalog.read",
  "catalog.manage",
  "staff.read",
  "staff.manage",
  "resource.read",
  "resource.manage",
  "customer.read",
  "customer.manage",
  "customer.sensitive.read",
  "booking.read",
  "booking.create",
  "booking.manage",
  "booking.own.read",
  "booking.own.manage",
  "payment.read",
  "payment.manage",
  "report.read",
  "audit.read",
  "schedule.own.manage",
] as const;

export type Capability = (typeof capabilities)[number];

const allCapabilities = new Set<Capability>(capabilities);

const roleCapabilities: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  PLATFORM_ADMIN: allCapabilities,
  ORGANIZATION_OWNER: new Set(
    capabilities.filter((capability) => capability !== "platform.manage"),
  ),
  ORGANIZATION_ADMIN: new Set([
    "organization.manage",
    "location.manage",
    "team.read",
    "team.manage",
    "catalog.read",
    "catalog.manage",
    "staff.read",
    "staff.manage",
    "resource.read",
    "resource.manage",
    "customer.read",
    "customer.manage",
    "customer.sensitive.read",
    "booking.read",
    "booking.create",
    "booking.manage",
    "payment.read",
    "payment.manage",
    "report.read",
  ]),
  FINANCE_VIEWER: new Set([
    "subscription.read",
    "billing.read",
    "payment.read",
    "report.read",
  ]),
  LOCATION_MANAGER: new Set([
    "location.manage",
    "team.read",
    "catalog.read",
    "catalog.manage",
    "staff.read",
    "staff.manage",
    "resource.read",
    "resource.manage",
    "customer.read",
    "customer.manage",
    "customer.sensitive.read",
    "booking.read",
    "booking.create",
    "booking.manage",
    "payment.read",
    "payment.manage",
    "report.read",
  ]),
  FRONT_DESK: new Set([
    "catalog.read",
    "staff.read",
    "resource.read",
    "customer.read",
    "customer.manage",
    "booking.read",
    "booking.create",
    "booking.manage",
    "payment.read",
    "payment.manage",
  ]),
  SERVICE_PROVIDER: new Set([
    "catalog.read",
    "booking.own.read",
    "booking.own.manage",
    "schedule.own.manage",
  ]),
};

export function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

export function hasCapability(
  assignedRoles: ReadonlySet<Role> | readonly Role[],
  capability: Capability,
): boolean {
  for (const role of assignedRoles) {
    if (roleCapabilities[role].has(capability)) {
      return true;
    }
  }
  return false;
}

export function capabilitiesForRoles(
  assignedRoles: ReadonlySet<Role> | readonly Role[],
): ReadonlySet<Capability> {
  const resolved = new Set<Capability>();
  for (const role of assignedRoles) {
    for (const capability of roleCapabilities[role]) {
      resolved.add(capability);
    }
  }
  return resolved;
}
