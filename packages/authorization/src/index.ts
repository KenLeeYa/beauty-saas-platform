import type { PermissionKey, RequestContext, TenantRole } from "@beauty-saas/shared";
import { permissionKeys } from "@beauty-saas/shared";

export const rolePermissions = {
  TENANT_OWNER: [...permissionKeys],
  TENANT_ADMIN: permissionKeys.filter((permission) => permission !== "audit.read"),
  AREA_MANAGER: [
    "branch.read",
    "staff.read",
    "service.read",
    "appointment.read",
    "appointment.create",
    "appointment.update",
    "customer.read",
    "report.branch.read"
  ],
  BRANCH_MANAGER: [
    "branch.read",
    "staff.read",
    "service.read",
    "appointment.read",
    "appointment.create",
    "appointment.update",
    "customer.read",
    "customer.create",
    "report.branch.read"
  ],
  RECEPTIONIST: [
    "appointment.read",
    "appointment.create",
    "appointment.update",
    "appointment.cancel",
    "customer.read",
    "customer.create",
    "service.read",
    "staff.read"
  ],
  STAFF: ["appointment.read", "customer.read", "service.read"],
  ACCOUNTANT: ["report.tenant.read", "report.branch.read", "customer.read"],
  MARKETING: ["customer.read", "customer.update", "settings.read"],
  VIEWER: ["tenant.read", "branch.read", "staff.read", "service.read", "appointment.read", "customer.read"]
} satisfies Record<TenantRole, PermissionKey[]>;

export type RequestContextInput = Omit<RequestContext, "requestId"> & {
  requestId?: string;
};

export function createRequestContext(input: RequestContextInput): RequestContext {
  return {
    ...input,
    requestId: input.requestId ?? crypto.randomUUID()
  };
}

export function permissionsForRole(role: TenantRole): PermissionKey[] {
  return rolePermissions[role];
}

export function hasPermission(context: Pick<RequestContext, "permissions">, permission: PermissionKey): boolean {
  return context.permissions.includes(permission);
}

export function assertPermission(context: Pick<RequestContext, "permissions">, permission: PermissionKey): void {
  if (!hasPermission(context, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

export function isBranchAllowed(allowedBranchIds: RequestContext["allowedBranchIds"], branchId: string): boolean {
  return allowedBranchIds === "*" || allowedBranchIds.includes(branchId);
}

export function assertBranchScope(context: RequestContext, branchId: string): void {
  if (!isBranchAllowed(context.allowedBranchIds, branchId)) {
    throw new Error("Branch is outside the active membership scope.");
  }
}
