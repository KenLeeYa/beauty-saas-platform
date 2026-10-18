import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/database/prisma";
import { resolveModuleVisibility } from "@/server/entitlements/module-visibility-policy";
import { getEntitlement } from "@/server/entitlements/service";
import { AppError } from "@/server/http/errors";
import { getWalletBalance } from "@/server/members/ledger";
import { getBenefitBalance } from "@/server/members/benefits";
import { requireMobileBookingContext } from "@/server/mobile/context";

export async function GET(request: Request): Promise<Response> {
  try {
    const store = z.string().min(1).max(100).parse(new URL(request.url).searchParams.get("store"));
    const { actor, context } = await requireMobileBookingContext(request, store);
    if (actor.kind !== "customer" || !actor.customerId) {
      throw new AppError("FORBIDDEN", "Customer account required", 403);
    }
    const [balance, issues, entitlement, switches] = await Promise.all([
      getWalletBalance(context.organizationId, actor.customerId),
      getBenefitBalance(context.organizationId, actor.customerId),
      getEntitlement(context.organizationId, "MEMBERSHIPS_PACKAGES"),
      prisma.$queryRaw<{ isActive: boolean }[]>(Prisma.sql`
        select is_active as "isActive" from public.store_module_activations
        where organization_id = ${context.organizationId}::uuid
          and location_id = ${context.locationId}::uuid
          and feature_key = 'MEMBERSHIPS_PACKAGES'::public.feature_key limit 1
      `),
    ]);
    const newIssuanceEnabled = resolveModuleVisibility("MEMBERSHIPS_PACKAGES",
      entitlement.enabled, switches[0]?.isActive ?? null) &&
      process.env.APP_ENV === "test" && process.env.MEMBER_VALUE_TEST_ONLY === "true";
    return Response.json({ visible: newIssuanceEnabled || balance.totalMinor > 0 || issues.length > 0,
      newIssuanceEnabled, balance, issues },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message },
      { status: error.status });
    return Response.json({ error: "Member account unavailable" }, { status: 400 });
  }
}
