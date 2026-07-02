import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ok } from "@beauty-saas/shared";
import type { ApiRequest } from "../../common/request-context.js";
import { TenantGuard } from "../../common/tenant.guard.js";
import { TenantCurrentService } from "./tenant-current.service.js";

@Controller("tenants/current")
export class TenantCurrentController {
  constructor(private readonly currentTenant: TenantCurrentService) {}

  @UseGuards(TenantGuard)
  @Get()
  show(@Req() request: ApiRequest) {
    return ok(this.currentTenant.getCurrentTenant(request.context!));
  }
}
