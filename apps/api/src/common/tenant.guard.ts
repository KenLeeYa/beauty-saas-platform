import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { createRequestContext } from "@beauty-saas/authorization";
import type { ApiRequest } from "./request-context.js";
import { readHeader } from "./request-context.js";

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const userId = readHeader(request, "x-user-id");
    const activeTenantId = readHeader(request, "x-active-tenant-id");
    const membershipId = readHeader(request, "x-membership-id");

    if (!userId || !activeTenantId || !membershipId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    const activeBranchId = readHeader(request, "x-active-branch-id");
    const requestId = readHeader(request, "x-request-id");
    const allowedBranchIds = readHeader(request, "x-allowed-branch-ids");

    request.context = createRequestContext({
      userId,
      activeTenantId,
      membershipId,
      permissions: (readHeader(request, "x-permissions") ?? "").split(",").filter(Boolean),
      allowedBranchIds: allowedBranchIds === "*"
        ? "*"
        : (allowedBranchIds ?? "").split(",").filter(Boolean),
      ...(activeBranchId ? { activeBranchId } : {}),
      ...(requestId ? { requestId } : {})
    });

    return true;
  }
}
