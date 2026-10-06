import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { getEntitlement } from "../entitlements/service";
import { AppError } from "../http/errors";
import { sha256 } from "../security/crypto";

type Kind = "COUPON" | "SERVICE_PACKAGE";
type Issue = { id: string; kind: Kind; customerId: string; expiresAt: Date | null;
  terms: { quantity: number; serviceVariantId?: string; discountMinor?: number } };
type Event = { kind: string; quantity: number; quantityDelta: number; bookingId: string | null;
  bookingRefundId: string | null; idempotencyHash: string };

function assertSynthetic(): void {
  if (process.env.APP_ENV !== "test" || process.env.MEMBER_VALUE_TEST_ONLY !== "true") {
    throw new AppError("FEATURE_UNAVAILABLE", "Benefit issuance is not activated", 503);
  }
}

function validQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000) {
    throw new AppError("BAD_REQUEST", "Invalid benefit quantity", 400);
  }
}

async function lockedIssue(transaction: Prisma.TransactionClient, organizationId: string,
  customerId: string, issueId: string): Promise<Issue> {
  const rows = await transaction.$queryRaw<Issue[]>(Prisma.sql`
    select id, kind, customer_id as "customerId", expires_at as "expiresAt",
      terms_snapshot as terms from public.member_benefit_issues
    where id=${issueId}::uuid and organization_id=${organizationId}::uuid
      and customer_id=${customerId}::uuid for update
  `);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Benefit not found", 404);
  return rows[0];
}

async function eventsFor(transaction: Prisma.TransactionClient, issueId: string): Promise<Event[]> {
  return transaction.$queryRaw<Event[]>(Prisma.sql`
    select kind, quantity, quantity_delta as "quantityDelta", booking_id as "bookingId",
      booking_refund_id as "bookingRefundId", idempotency_hash as "idempotencyHash"
    from public.member_benefit_events where issue_id=${issueId}::uuid order by created_at,id
  `);
}

export async function getBenefitBalance(organizationId: string, customerId: string):
  Promise<Array<{ id: string; kind: Kind; available: number; terms: Issue["terms"];
    expiresAt: string | null }>> {
  const issues = await prisma.$queryRaw<Issue[]>(Prisma.sql`
    select id, kind, customer_id as "customerId", expires_at as "expiresAt",
      terms_snapshot as terms from public.member_benefit_issues
    where organization_id=${organizationId}::uuid and customer_id=${customerId}::uuid
    order by issued_at desc limit 100
  `);
  return Promise.all(issues.map(async issue => {
    const events = await eventsFor(prisma, issue.id);
    return { id: issue.id, kind: issue.kind, terms: issue.terms,
      expiresAt: issue.expiresAt?.toISOString() ?? null,
      available: events.reduce((sum, event) => sum + event.quantityDelta, 0) };
  }));
}

export async function issueSyntheticBenefit(input: { organizationId: string; locationId: string;
  customerId: string; kind: Kind; quantity: number; serviceVariantId?: string;
  discountMinor?: number; expiresAt?: Date; idempotencyKey: string }): Promise<string> {
  assertSynthetic(); validQuantity(input.quantity);
  if (input.kind === "SERVICE_PACKAGE" && !input.serviceVariantId) {
    throw new AppError("BAD_REQUEST", "Package service required", 400);
  }
  if (input.kind === "COUPON" && (!Number.isSafeInteger(input.discountMinor) ||
      (input.discountMinor ?? 0) <= 0)) {
    throw new AppError("BAD_REQUEST", "Coupon amount required", 400);
  }
  const terms = { quantity: input.quantity, serviceVariantId: input.serviceVariantId,
    discountMinor: input.discountMinor };
  const entitlement = await getEntitlement(input.organizationId, "MEMBERSHIPS_PACKAGES");
  if (!entitlement.enabled) throw new AppError("FEATURE_UNAVAILABLE",
    "New benefit issuance disabled", 503);
  return prisma.$transaction(async transaction => {
    const switches = await transaction.$queryRaw<{ isActive: boolean }[]>(Prisma.sql`
      select is_active as "isActive" from public.store_module_activations
      where organization_id=${input.organizationId}::uuid
        and location_id=${input.locationId}::uuid
        and feature_key='MEMBERSHIPS_PACKAGES'::public.feature_key limit 1
    `);
    if (switches[0] && !switches[0].isActive) {
      throw new AppError("FEATURE_UNAVAILABLE", "New benefit issuance disabled", 503);
    }
    const customer = await transaction.customers.findFirst({ where: {
      id: input.customerId, organization_id: input.organizationId,
    }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found", 404);
    const hash = sha256(input.idempotencyKey);
    const inserted = await transaction.$queryRaw<{ id: string; kind: Kind;
      terms: Issue["terms"] }[]>(Prisma.sql`
      insert into public.member_benefit_issues
        (organization_id,customer_id,kind,terms_snapshot,expires_at,issue_key_hash)
      values (${input.organizationId}::uuid,${input.customerId}::uuid,
        ${input.kind},${JSON.stringify(terms)}::jsonb,${input.expiresAt ?? null},${hash})
      on conflict (organization_id,customer_id,issue_key_hash)
        where issue_key_hash is not null do nothing
      returning id,kind,terms_snapshot as terms
    `);
    const rows = inserted.length ? inserted :
      await transaction.$queryRaw<{ id: string; kind: Kind;
        terms: Issue["terms"] }[]>(Prisma.sql`
        select id,kind,terms_snapshot as terms
        from public.member_benefit_issues
        where organization_id=${input.organizationId}::uuid
          and customer_id=${input.customerId}::uuid and issue_key_hash=${hash}
      `);
    if (!rows[0]) throw new AppError("CONFLICT", "Issue retry unavailable", 409);
    if (rows[0].kind !== input.kind || rows[0].terms.quantity !== terms.quantity ||
        rows[0].terms.serviceVariantId !== terms.serviceVariantId ||
        rows[0].terms.discountMinor !== terms.discountMinor) {
      throw new AppError("CONFLICT", "Issue key reused with different terms", 409);
    }
    await transaction.$executeRaw(Prisma.sql`
      insert into public.member_benefit_events
        (issue_id,kind,quantity,quantity_delta,idempotency_hash)
      values (${rows[0].id}::uuid,'ISSUED',${input.quantity},${input.quantity},${hash})
      on conflict (issue_id,idempotency_hash) do nothing
    `);
    return rows[0].id;
  });
}

export async function moveSyntheticBenefit(input: { organizationId: string;
  customerId: string; issueId: string; bookingId: string;
  action: "RESERVE" | "REDEEM" | "RELEASE" | "REFUND" | "CANCEL";
  quantity: number; idempotencyKey: string; bookingRefundId?: string }):
  Promise<{ available: number }> {
  assertSynthetic(); validQuantity(input.quantity);
  return prisma.$transaction(async transaction => {
    const issue = await lockedIssue(transaction, input.organizationId,
      input.customerId, input.issueId);
    const booking = await transaction.bookings.findFirst({ where: {
      id: input.bookingId, organization_id: input.organizationId,
      customer_id: input.customerId,
    }, select: { id: true, status: true, total_minor: true,
      booking_segments: { select: { service_variant_id: true } } } });
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found", 404);
    if (["RESERVE", "REDEEM"].includes(input.action) &&
        !["CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED"].includes(booking.status)) {
      throw new AppError("CONFLICT", "Booking is not active", 409);
    }
    if (["RESERVE", "REDEEM"].includes(input.action) &&
        issue.kind === "SERVICE_PACKAGE" && !booking.booking_segments.some(segment =>
          segment.service_variant_id === issue.terms.serviceVariantId)) {
      throw new AppError("CONFLICT", "Package does not cover this service", 409);
    }
    if (["RESERVE", "REDEEM"].includes(input.action) &&
        issue.kind === "COUPON" &&
        (issue.terms.discountMinor ?? 0) * input.quantity > booking.total_minor) {
      throw new AppError("CONFLICT", "Coupon exceeds booking amount", 409);
    }
    const events = await eventsFor(transaction, issue.id);
    const hash = sha256(input.idempotencyKey);
    const existing = events.find(event => event.idempotencyHash === hash);
    if (existing) {
      if (existing.bookingId !== input.bookingId || existing.quantity !== input.quantity ||
          existing.bookingRefundId !== (input.bookingRefundId ?? null) ||
          existing.kind !== ({ RESERVE: "RESERVED", REDEEM: "REDEEMED",
            RELEASE: "RELEASED", REFUND: "REFUNDED", CANCEL: "CANCELLED" }[input.action])) {
        throw new AppError("CONFLICT", "Benefit key reused", 409);
      }
      return { available: events.reduce((sum, event) => sum + event.quantityDelta, 0) };
    }
    const available = events.reduce((sum, event) => sum + event.quantityDelta, 0);
    const bookingEvents = events.filter(event => event.bookingId === input.bookingId);
    const reserved = -bookingEvents.filter(event => event.kind === "RESERVED")
      .reduce((sum, event) => sum + event.quantityDelta, 0) -
      bookingEvents.filter(event => event.kind === "RELEASED")
        .reduce((sum, event) => sum + event.quantityDelta, 0) -
      bookingEvents.filter(event => event.kind === "REDEEMED")
        .reduce((sum, event) => sum + event.quantity, 0);
    let delta = 0;
    let kind: string;
    if (input.action === "RESERVE") {
      const stacked = await transaction.$queryRaw<{ issueId: string }[]>(Prisma.sql`
        select issue_id as "issueId" from public.member_benefit_events
        where booking_id=${input.bookingId}::uuid and issue_id<>${issue.id}::uuid
        group by issue_id having sum(quantity_delta)<0 limit 1
      `);
      if (stacked[0]) throw new AppError("CONFLICT", "Benefits cannot stack", 409);
      if (issue.expiresAt && issue.expiresAt <= new Date()) {
        throw new AppError("CONFLICT", "Benefit expired", 409);
      }
      if (available < input.quantity) throw new AppError("CONFLICT", "Benefit exhausted", 409);
      delta = -input.quantity; kind = "RESERVED";
    } else if (input.action === "REDEEM") {
      if (reserved < input.quantity) throw new AppError("CONFLICT", "Reservation required", 409);
      kind = "REDEEMED";
    } else if (input.action === "RELEASE") {
      if (reserved < input.quantity) throw new AppError("CONFLICT", "Reservation required", 409);
      delta = input.quantity; kind = "RELEASED";
    } else if (input.action === "CANCEL") {
      if (available < input.quantity || reserved > 0) {
        throw new AppError("CONFLICT", "Benefit cannot be cancelled while reserved", 409);
      }
      delta = -input.quantity; kind = "CANCELLED";
    } else {
      if (!input.bookingRefundId) throw new AppError("BAD_REQUEST", "Confirmed refund required", 400);
      const refund = await transaction.booking_refunds.findFirst({ where: {
        id: input.bookingRefundId, organization_id: input.organizationId,
        booking_id: input.bookingId, status: "CONFIRMED",
      }, select: { id: true } });
      if (!refund) throw new AppError("NOT_FOUND", "Confirmed refund not found", 404);
      const consumed = bookingEvents.filter(event => event.kind === "REDEEMED")
        .reduce((sum, event) => sum + event.quantity, 0);
      const returned = bookingEvents.filter(event => event.kind === "REFUNDED")
        .reduce((sum, event) => sum + event.quantity, 0);
      if (consumed - returned < input.quantity ||
          bookingEvents.some(event => event.bookingRefundId === input.bookingRefundId)) {
        throw new AppError("CONFLICT", "Refund exceeds consumed benefit", 409);
      }
      delta = input.quantity; kind = "REFUNDED";
    }
    await transaction.$executeRaw(Prisma.sql`
      insert into public.member_benefit_events
        (issue_id,kind,quantity,quantity_delta,idempotency_hash,booking_id,booking_refund_id)
      values (${issue.id}::uuid,${kind},${input.quantity},${delta},${hash},
        ${input.bookingId}::uuid,${input.bookingRefundId ?? null}::uuid)
    `);
    return { available: available + delta };
  });
}
