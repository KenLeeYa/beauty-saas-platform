import { Module } from "@nestjs/common";
import { PlatformTenantsController } from "./platform-tenants.controller.js";
import { PlatformTenantService } from "./platform-tenant.service.js";

@Module({
  controllers: [PlatformTenantsController],
  providers: [PlatformTenantService]
})
export class PlatformModule {}
