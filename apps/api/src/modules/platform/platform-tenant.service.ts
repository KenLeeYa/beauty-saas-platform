import { Injectable } from "@nestjs/common";
import type { TenantSummary } from "@beauty-saas/shared";

@Injectable()
export class PlatformTenantService {
  listTenants(): TenantSummary[] {
    return [];
  }
}
