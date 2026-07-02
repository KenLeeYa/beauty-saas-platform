import { Module } from "@nestjs/common";
import { TenantCurrentController } from "./tenant-current.controller.js";
import { TenantCurrentService } from "./tenant-current.service.js";

@Module({
  controllers: [TenantCurrentController],
  providers: [TenantCurrentService]
})
export class TenantModule {}
