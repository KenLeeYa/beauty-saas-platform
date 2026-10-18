import "server-only";

import { Prisma } from "@prisma/client";
import { assertCapability,requireLocation,type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { requireModule } from "../entitlements/module-visibility";
import { AppError } from "../http/errors";

export type MarketingConsentReview = { customerId:string; currentlyGranted:boolean;
  history:Array<{ status:"GRANTED"|"REVOKED"; capturedAt:string;
    source:string; policyVersion:string }> };

export async function getMarketingConsentReview(context: OrganizationContext,
  customerId:string): Promise<MarketingConsentReview> {
  assertCapability(context,"customer.read");
  const location=requireLocation(context);
  await requireModule(context,"CUSTOMER_CRM");
  const customer=await prisma.customers.findFirst({ where:{ id:customerId,
    organization_id:context.organization.id },select:{ id:true } });
  if (!customer) throw new AppError("NOT_FOUND","Customer not found",404);
  if (!context.allLocations) {
    const scoped=await prisma.$queryRaw<{ id:string }[]>(Prisma.sql`
      select id from public.bookings where organization_id=${context.organization.id}::uuid
        and location_id=${location.id}::uuid and customer_id=${customerId}::uuid limit 1
    `);
    if (!scoped[0]) throw new AppError("NOT_FOUND","Customer not found",404);
  }
  const rows=await prisma.customer_consents.findMany({ where:{
    organization_id:context.organization.id,customer_id:customerId,
    consent_type:"MARKETING" },orderBy:[{ captured_at:"desc" },{ id:"desc" }],
    take:50,select:{ status:true,captured_at:true,source:true,policy_version:true } });
  return { customerId,currentlyGranted:rows[0]?.status==="GRANTED",
    history:rows.map(row => ({ status:row.status,capturedAt:row.captured_at.toISOString(),
      source:row.source,policyVersion:row.policy_version })) };
}
