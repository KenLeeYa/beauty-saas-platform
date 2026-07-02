import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module.js";
import { PlatformModule } from "./modules/platform/platform.module.js";
import { TenantModule } from "./modules/tenant/tenant.module.js";

@Module({
  imports: [HealthModule, PlatformModule, TenantModule]
})
export class AppModule {}
