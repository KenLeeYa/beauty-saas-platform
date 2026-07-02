import { Injectable } from "@nestjs/common";
import type { RequestContext, TenantSummary } from "@beauty-saas/shared";

@Injectable()
export class TenantCurrentService {
  getCurrentTenant(context: RequestContext): TenantSummary {
    return {
      id: context.activeTenantId,
      name: "Current tenant",
      slug: "current",
      status: "ACTIVE",
      industryType: "OTHER",
      timezone: "Asia/Taipei"
    };
  }
}
