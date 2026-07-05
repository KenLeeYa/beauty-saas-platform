import { Controller, Get, Inject } from "@nestjs/common";
import { ok } from "@beauty-saas/shared";
import { PlatformTenantService } from "./platform-tenant.service.js";

@Controller("platform/tenants")
export class PlatformTenantsController {
  constructor(@Inject(PlatformTenantService) private readonly tenants: PlatformTenantService) {}

  @Get()
  list() {
    return ok(this.tenants.listTenants());
  }
}
