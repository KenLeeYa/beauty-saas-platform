import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";

export type CommissionRuleVersion = {
  id: string; version: number; priority: number;
  organizationId: string; locationId: string | null;
  serviceVariantId: string | null; staffProfileId: string | null;
  basis: "ORIGINAL" | "DISCOUNTED" | "PAID_COMPONENT" | "FIXED";
  rateBps: number | null; fixedMinor: number | null;
  excludeFeeTax: boolean; effectiveFrom: Date; effectiveUntil: Date;
};

export type CompletedCommissionSegment = {
  id: string; organizationId: string; locationId: string;
  serviceVariantId: string; staffProfileIds: readonly string[];
  listPriceMinor: number; discountedPriceMinor: number;
  paymentFeeMinor: number; taxMinor: number;
  completedAt: Date; refundMinor?: number;
};

export type CommissionLine = { segmentId: string; staffProfileId: string;
  ruleId: string; ruleVersion: number; basisMinor: number;
  commissionMinor: number; refunded: boolean };

function assertPrice(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError("BAD_REQUEST", "Invalid commission input", 400);
  }
}

export function quoteCommission(segments: readonly CompletedCommissionSegment[],
  tender: { paidMinor: number; bonusMinor: number },
  rules: readonly CommissionRuleVersion[], sourceKind: "SERVICE_COMPLETION" | "TOPUP" =
  "SERVICE_COMPLETION"): CommissionLine[] {
  if (sourceKind === "TOPUP") return [];
  assertPrice(tender.paidMinor); assertPrice(tender.bonusMinor);
  const totalNet = segments.reduce((sum, segment) => {
    for (const amount of [segment.listPriceMinor, segment.discountedPriceMinor,
      segment.paymentFeeMinor, segment.taxMinor, segment.refundMinor ?? 0]) assertPrice(amount);
    if (segment.discountedPriceMinor > segment.listPriceMinor ||
        (segment.refundMinor ?? 0) > segment.discountedPriceMinor) {
      throw new AppError("BAD_REQUEST", "Invalid commission price", 400);
    }
    return sum + segment.discountedPriceMinor;
  }, 0);
  if (tender.paidMinor + tender.bonusMinor > totalNet) {
    throw new AppError("BAD_REQUEST", "Tender exceeds service total", 400);
  }
  let paidAllocated = 0;
  return segments.flatMap((segment, index) => {
    const paid = index === segments.length - 1 ? tender.paidMinor - paidAllocated :
      totalNet ? Math.floor(tender.paidMinor * segment.discountedPriceMinor / totalNet) : 0;
    paidAllocated += paid;
    const selected = segment.staffProfileIds.map(staffProfileId => {
      const candidates = rules.filter(rule => rule.organizationId === segment.organizationId &&
        (!rule.locationId || rule.locationId === segment.locationId) &&
        (!rule.serviceVariantId || rule.serviceVariantId === segment.serviceVariantId) &&
        (!rule.staffProfileId || rule.staffProfileId === staffProfileId) &&
        rule.effectiveFrom <= segment.completedAt && rule.effectiveUntil > segment.completedAt)
        .sort((left, right) => right.priority - left.priority ||
          Number(Boolean(right.staffProfileId)) - Number(Boolean(left.staffProfileId)) ||
          Number(Boolean(right.serviceVariantId)) - Number(Boolean(left.serviceVariantId)) ||
          left.id.localeCompare(right.id));
      const rule = candidates[0];
      if (!rule) return null;
      const beforeFees = rule.basis === "ORIGINAL" ? segment.listPriceMinor :
        rule.basis === "DISCOUNTED" ? segment.discountedPriceMinor :
        rule.basis === "PAID_COMPONENT" ? paid : 0;
      const basisMinor = rule.basis === "FIXED" ? 0 : Math.max(0,
        beforeFees - (rule.excludeFeeTax ? segment.paymentFeeMinor + segment.taxMinor : 0));
      const quoted = rule.basis === "FIXED" ? rule.fixedMinor! :
        Math.floor(basisMinor * rule.rateBps! / 10000);
      return { segmentId: segment.id, staffProfileId, ruleId: rule.id,
        ruleVersion: rule.version, basisMinor, commissionMinor: quoted,
        refunded: Boolean(segment.refundMinor) };
    }).filter((line): line is CommissionLine => Boolean(line));
    let budget = segment.discountedPriceMinor;
    return selected.map(line => {
      const awarded = Math.min(budget, line.commissionMinor);
      budget -= awarded;
      return { ...line, commissionMinor: segment.refundMinor ?
        -Math.floor(awarded * segment.refundMinor / segment.discountedPriceMinor) : awarded };
    });
  });
}

export async function loadPublishedCommissionRules(organizationId: string,
  at: Date): Promise<CommissionRuleVersion[]> {
  return prisma.$queryRaw<CommissionRuleVersion[]>(Prisma.sql`
    select id, version, priority, organization_id as "organizationId",
      location_id as "locationId", service_variant_id as "serviceVariantId",
      staff_profile_id as "staffProfileId", basis, rate_bps as "rateBps",
      fixed_minor as "fixedMinor", exclude_fee_tax as "excludeFeeTax",
      effective_from as "effectiveFrom", effective_until as "effectiveUntil"
    from public.commission_rule_versions
    where organization_id = ${organizationId}::uuid
      and published_at is not null and effective_from <= ${at}
      and effective_until > ${at}
  `);
}

export async function publishCommissionRule(input: { context: OrganizationContext;
  ruleId: string; requestId: string }): Promise<void> {
  assertCapability(input.context, "organization.manage");
  await prisma.$transaction(async transaction => {
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${input.context.organization.id}), 20261006)
    `);
    const rules = await transaction.$queryRaw<{ id: string; priority: number;
      locationId: string | null; variantId: string | null; staffId: string | null;
      startsAt: Date; endsAt: Date }[]>(Prisma.sql`
      select id, priority, location_id as "locationId",
        service_variant_id as "variantId", staff_profile_id as "staffId",
        effective_from as "startsAt", effective_until as "endsAt"
      from public.commission_rule_versions
      where id = ${input.ruleId}::uuid
        and organization_id = ${input.context.organization.id}::uuid
        and published_at is null for update
    `);
    const rule = rules[0];
    if (!rule) throw new AppError("NOT_FOUND", "Draft commission rule not found", 404);
    const conflict = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.commission_rule_versions
      where organization_id = ${input.context.organization.id}::uuid
        and id <> ${rule.id}::uuid and published_at is not null
        and priority = ${rule.priority}
        and (location_id is null or ${rule.locationId}::uuid is null
          or location_id = ${rule.locationId}::uuid)
        and (service_variant_id is null or ${rule.variantId}::uuid is null
          or service_variant_id = ${rule.variantId}::uuid)
        and (staff_profile_id is null or ${rule.staffId}::uuid is null
          or staff_profile_id = ${rule.staffId}::uuid)
        and tstzrange(effective_from,effective_until,'[)') &&
          tstzrange(${rule.startsAt},${rule.endsAt},'[)')
      limit 1
    `);
    if (conflict[0]) throw new AppError("CONFLICT", "Commission priority overlaps", 409);
    await transaction.$executeRaw(Prisma.sql`
      update public.commission_rule_versions set published_at=now(),
        published_by_profile_id=${input.context.session.profileId}::uuid
      where id=${rule.id}::uuid
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id,
      location_id: rule.locationId,
      actor_profile_id: input.context.session.profileId,
      action: "COMMISSION_RULE_PUBLISHED", target_type: "COMMISSION_RULE",
      target_id: rule.id, outcome: "SUCCESS", request_id: input.requestId,
      after_json: { ruleId: rule.id, priority: rule.priority },
    } });
  });
}
