import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../../../server/authorization/context";
import { prisma } from "../../../server/database/prisma";
import { requireModule } from "../../../server/entitlements/module-visibility";
import { requireEntitlement } from "../../../server/entitlements/service";
import { AppError } from "../../../server/http/errors";

type QueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function getBookingEligibility(organizationId: string, locationId: string,
  customerId: string, client: QueryClient = prisma, at = new Date()):
  Promise<{ allowed: boolean; vip: boolean }> {
  const rows = await client.$queryRaw<{ blocked: boolean; vip: boolean }[]>(Prisma.sql`
    select (
      customer.is_blacklisted or exists (
        select 1 from public.customer_status_rules rule
        where rule.organization_id = customer.organization_id
          and rule.customer_id = customer.id
          and (rule.location_id is null or rule.location_id = ${locationId}::uuid)
          and rule.status_kind = 'BLACKLIST' and rule.resolved_at is null
          and rule.effective_from <= ${at}
          and (rule.expires_at is null or rule.expires_at > ${at})
      )
    ) as blocked,
    exists (
      select 1 from public.customer_status_rules rule
      where rule.organization_id = customer.organization_id
        and rule.customer_id = customer.id
        and (rule.location_id is null or rule.location_id = ${locationId}::uuid)
        and rule.status_kind = 'VIP' and rule.resolved_at is null
        and rule.effective_from <= ${at}
        and (rule.expires_at is null or rule.expires_at > ${at})
    ) as vip
    from public.customers customer
    where customer.organization_id = ${organizationId}::uuid
      and customer.id = ${customerId}::uuid and customer.is_active
  `);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Customer not found", 404);
  return { allowed: !rows[0].blocked, vip: rows[0].vip };
}

export async function setCustomerStatus(input: { context: OrganizationContext;
  customerId: string; scope: "ORGANIZATION" | "LOCATION";
  statusKind: "BLACKLIST" | "VIP"; enabled: boolean;
  effectiveFrom?: Date; expiresAt?: Date | null; reviewAt?: Date | null;
  reason: string; requestId: string }): Promise<void> {
  assertCapability(input.context, input.scope === "ORGANIZATION" ?
    "organization.manage" : "customer.manage");
  const locationId = input.scope === "LOCATION" ? requireLocation(input.context).id : null;
  await requireModule(input.context, "CUSTOMER_CRM");
  if (input.statusKind === "BLACKLIST") {
    await requireEntitlement(input.context.organization.id, "CUSTOMER_BLACKLIST");
  }
  const reason = input.reason.trim();
  const effectiveFrom = input.effectiveFrom ?? new Date();
  if (!reason || reason.length > 500 ||
      (input.expiresAt && input.expiresAt <= effectiveFrom)) {
    throw new AppError("BAD_REQUEST", "Invalid customer status terms", 400);
  }
  await prisma.$transaction(async transaction => {
    const customer = await transaction.customers.findFirst({ where: {
      id: input.customerId, organization_id: input.context.organization.id, is_active: true,
    }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found", 404);
    await transaction.$executeRaw(Prisma.sql`
      update public.customer_status_rules set resolved_at = now()
      where organization_id = ${input.context.organization.id}::uuid
        and customer_id = ${input.customerId}::uuid
        and location_id is not distinct from ${locationId}::uuid
        and status_kind = ${input.statusKind} and resolved_at is null
    `);
    let ruleId: string | null = null;
    if (input.enabled) {
      const inserted = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into public.customer_status_rules
          (organization_id, location_id, customer_id, status_kind,
           effective_from, expires_at, review_at, reason, actor_profile_id)
        values (${input.context.organization.id}::uuid, ${locationId}::uuid,
          ${input.customerId}::uuid, ${input.statusKind}, ${effectiveFrom},
          ${input.expiresAt ?? null}, ${input.reviewAt ?? null}, ${reason},
          ${input.context.session.profileId}::uuid) returning id
      `);
      ruleId = inserted[0].id;
    }
    await transaction.$executeRaw(Prisma.sql`
      insert into public.customer_status_events
        (organization_id, status_rule_id, customer_id, actor_profile_id,
         action, reason)
      values (${input.context.organization.id}::uuid, ${ruleId}::uuid,
        ${input.customerId}::uuid, ${input.context.session.profileId}::uuid,
        ${input.enabled ? "SET" : "CLEARED"}, ${reason})
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id, location_id: locationId,
      actor_profile_id: input.context.session.profileId,
      action: "CUSTOMER_STATUS_CHANGED", target_type: "CUSTOMER",
      target_id: input.customerId, outcome: "SUCCESS", request_id: input.requestId,
      after_json: { kind: input.statusKind, enabled: input.enabled,
        scope: input.scope, expiresAt: input.expiresAt?.toISOString() ?? null },
    } });
  });
}
