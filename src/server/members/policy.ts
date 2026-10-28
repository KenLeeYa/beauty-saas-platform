import "server-only";

import { Prisma } from "@prisma/client";

import { getBookingEligibility } from "../../modules/crm/server/customer-status";
import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { formatDateInTimeZone } from "../time/timezone";

type Policy = { id: string; version: number; kind: string; priority: number;
  discountPercent: number; maxDiscountMinor: number | null;
  attestationRequired: boolean; locationId: string | null;
  serviceVariantId: string | null };

export type PromotionQuote = { listPriceMinor: number; discountMinor: number;
  payableMinor: number; currency: string; stackingOutcome: "EXCLUSIVE";
  lines: Array<{ serviceVariantId: string; listPriceMinor: number;
    discountMinor: number; policyId: string | null; policyVersion: number | null }> };

export async function quotePromotion(input: {
  organizationId: string; locationId: string; customerId: string;
  timezone: string; currency: string;
  segments: ReadonlyArray<{ serviceVariantId: string; listPriceMinor: number }>;
  at: Date; relationshipAttested?: boolean;
}): Promise<PromotionQuote> {
  if (input.segments.length === 0 || input.segments.length > 20 ||
      input.segments.some(segment => !Number.isSafeInteger(segment.listPriceMinor) ||
        segment.listPriceMinor < 0)) throw new AppError("BAD_REQUEST", "Invalid quote", 400);
  const eligibility = await getBookingEligibility(input.organizationId,
    input.locationId, input.customerId, prisma, input.at);
  if (!eligibility.allowed) throw new AppError("FORBIDDEN", "Booking unavailable", 403);
  const policies = await prisma.$queryRaw<Policy[]>(Prisma.sql`
    select id, version, kind, priority,
      discount_percent as "discountPercent",
      max_discount_minor as "maxDiscountMinor",
      attestation_required as "attestationRequired",
      location_id as "locationId", service_variant_id as "serviceVariantId"
    from public.member_promotion_policies
    where organization_id = ${input.organizationId}::uuid
      and (location_id is null or location_id = ${input.locationId}::uuid)
      and published_at is not null
      and effective_from <= ${input.at} and effective_until > ${input.at}
  `);
  const customer = await prisma.customers.findFirst({ where: {
    id: input.customerId, organization_id: input.organizationId,
  }, select: { birthday: true } });
  const localDate = formatDateInTimeZone(input.at, input.timezone);
  const [year, month, day] = localDate.split("-").map(Number);
  const birthday = customer?.birthday &&
    customer.birthday.getUTCMonth() + 1 === month && customer.birthday.getUTCDate() === day;
  const used = await prisma.$queryRaw<{ policyId: string; kind: string }[]>(Prisma.sql`
    select usage.policy_id as "policyId", policy.kind
    from public.member_promotion_usage usage
    join public.member_promotion_policies policy on policy.id = usage.policy_id
    where usage.organization_id = ${input.organizationId}::uuid
      and usage.customer_id = ${input.customerId}::uuid
      and usage.benefit_year = ${year}
  `);
  const usedIds = new Set(used.map(row => row.policyId));
  const birthdayUsed = used.some(row => row.kind === "BIRTHDAY");
  const caps = new Map<string, number>();
  const lines = input.segments.map(segment => {
    const candidates = policies.filter(policy =>
      (!policy.serviceVariantId || policy.serviceVariantId === segment.serviceVariantId) &&
      (!policy.attestationRequired || input.relationshipAttested) &&
      (policy.kind !== "BIRTHDAY" || (birthday && !birthdayUsed && !usedIds.has(policy.id))) &&
      (policy.kind !== "VIP" || eligibility.vip));
    candidates.sort((left, right) => right.priority - left.priority ||
      Number(Boolean(right.serviceVariantId)) - Number(Boolean(left.serviceVariantId)) ||
      Number(Boolean(right.locationId)) - Number(Boolean(left.locationId)) ||
      left.id.localeCompare(right.id));
    const policy = candidates[0];
    let discountMinor = policy ? Math.floor(segment.listPriceMinor * policy.discountPercent / 100) : 0;
    if (policy?.maxDiscountMinor !== null && policy) {
      const remaining = Math.max(0, policy.maxDiscountMinor - (caps.get(policy.id) ?? 0));
      discountMinor = Math.min(discountMinor, remaining);
      caps.set(policy.id, (caps.get(policy.id) ?? 0) + discountMinor);
    }
    return { serviceVariantId: segment.serviceVariantId,
      listPriceMinor: segment.listPriceMinor, discountMinor,
      policyId: policy?.id ?? null, policyVersion: policy?.version ?? null };
  });
  const listPriceMinor = lines.reduce((sum, line) => sum + line.listPriceMinor, 0);
  const discountMinor = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  return { listPriceMinor, discountMinor, payableMinor: listPriceMinor - discountMinor,
    currency: input.currency, stackingOutcome: "EXCLUSIVE", lines };
}

export async function publishPromotion(input: { context: OrganizationContext;
  policyId: string; requestId: string }): Promise<void> {
  assertCapability(input.context, "catalog.manage");
  const location = requireLocation(input.context);
  await prisma.$transaction(async transaction => {
    await transaction.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtext(${input.context.organization.id}), 20261005)
    `);
    const rows = await transaction.$queryRaw<{ id: string; locationId: string | null;
      variantId: string | null; priority: number; startsAt: Date; endsAt: Date }[]>(Prisma.sql`
      select id, location_id as "locationId", service_variant_id as "variantId",
        priority, effective_from as "startsAt", effective_until as "endsAt"
      from public.member_promotion_policies
      where id = ${input.policyId}::uuid
        and organization_id = ${input.context.organization.id}::uuid
        and (location_id is null or location_id = ${location.id}::uuid)
        and published_at is null for update
    `);
    const policy = rows[0];
    if (!policy) throw new AppError("NOT_FOUND", "Draft promotion not found", 404);
    const conflicts = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.member_promotion_policies
      where organization_id = ${input.context.organization.id}::uuid
        and id <> ${policy.id}::uuid and published_at is not null
        and priority = ${policy.priority}
        and (location_id is null or ${policy.locationId}::uuid is null
          or location_id = ${policy.locationId}::uuid)
        and (service_variant_id is null or ${policy.variantId}::uuid is null
          or service_variant_id = ${policy.variantId}::uuid)
        and tstzrange(effective_from, effective_until, '[)') &&
          tstzrange(${policy.startsAt}, ${policy.endsAt}, '[)')
      limit 1
    `);
    if (conflicts[0]) throw new AppError("CONFLICT", "Promotion priority overlaps", 409);
    await transaction.$executeRaw(Prisma.sql`
      update public.member_promotion_policies
      set published_at = now(), published_by_profile_id = ${input.context.session.profileId}::uuid
      where id = ${policy.id}::uuid and published_at is null
    `);
    await transaction.audit_logs.create({ data: {
      organization_id: input.context.organization.id, location_id: policy.locationId,
      actor_profile_id: input.context.session.profileId,
      action: "PROMOTION_PUBLISHED", target_type: "PROMOTION", target_id: policy.id,
      outcome: "SUCCESS", request_id: input.requestId,
      after_json: { policyId: policy.id, priority: policy.priority },
    } });
  });
}
