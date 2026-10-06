import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { getEntitlement } from "../entitlements/service";
import { AppError } from "../http/errors";
import { randomToken, sha256 } from "../security/crypto";

export type TenderAllocation = { paidMinor: number; bonusMinor: number;
  amountMinor: number; policy: "PAID_FIRST" | "PRO_RATA_10_1" };

function assertSyntheticWallet(): void {
  if (process.env.APP_ENV !== "test" || process.env.MEMBER_VALUE_TEST_ONLY !== "true") {
    throw new AppError("FEATURE_UNAVAILABLE", "Stored value is not activated", 503);
  }
}

function asMoney(value: bigint | number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new AppError("INTERNAL_ERROR", "Balance overflow", 500);
  return number;
}

export function allocateTender(amountMinor: number, availablePaid: number,
  availableBonus: number, policy: TenderAllocation["policy"]): TenderAllocation {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 ||
      amountMinor > availablePaid + availableBonus) {
    throw new AppError("CONFLICT", "Insufficient balance", 409);
  }
  const preferredPaid = policy === "PAID_FIRST" ? amountMinor : Math.floor(amountMinor * 10 / 11);
  const paidMinor = Math.min(availablePaid, Math.max(amountMinor - availableBonus, preferredPaid));
  return { amountMinor, paidMinor, bonusMinor: amountMinor - paidMinor, policy };
}

async function accountFor(transaction: Prisma.TransactionClient,
  organizationId: string, customerId: string) {
  const accounts = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into public.member_wallet_accounts (organization_id, customer_id, currency)
    values (${organizationId}::uuid, ${customerId}::uuid, 'TWD')
    on conflict (organization_id, customer_id, currency)
    do update set currency = excluded.currency returning id
  `);
  return accounts[0].id;
}

async function lockedBalance(transaction: Prisma.TransactionClient, accountId: string):
  Promise<{ paidMinor: number; bonusMinor: number }> {
  await transaction.$executeRaw(Prisma.sql`
    select id from public.member_wallet_accounts where id = ${accountId}::uuid for update
  `);
  const rows = await transaction.$queryRaw<{ paid: bigint; bonus: bigint }[]>(Prisma.sql`
    select coalesce(sum(case when component = 'PAID' then delta_minor else 0 end),0)::bigint as paid,
      coalesce(sum(case when component = 'BONUS' then delta_minor else 0 end),0)::bigint as bonus
    from public.member_wallet_entries where account_id = ${accountId}::uuid
  `);
  const reserved = await transaction.$queryRaw<{ paid: bigint; bonus: bigint }[]>(Prisma.sql`
    select coalesce(sum(paid_minor),0)::bigint as paid,
      coalesce(sum(bonus_minor),0)::bigint as bonus
    from public.member_wallet_reservations
    where account_id = ${accountId}::uuid and status = 'RESERVED' and expires_at > now()
  `);
  return { paidMinor: asMoney(rows[0].paid - reserved[0].paid),
    bonusMinor: asMoney(rows[0].bonus - reserved[0].bonus) };
}

export async function getWalletBalance(organizationId: string, customerId: string):
  Promise<{ paidMinor: number; bonusMinor: number; totalMinor: number }> {
  const rows = await prisma.$queryRaw<{ paid: bigint; bonus: bigint }[]>(Prisma.sql`
    select coalesce(sum(case when entry.component = 'PAID' then entry.delta_minor else 0 end),0)::bigint as paid,
      coalesce(sum(case when entry.component = 'BONUS' then entry.delta_minor else 0 end),0)::bigint as bonus
    from public.member_wallet_accounts account
    left join public.member_wallet_entries entry on entry.account_id = account.id
    where account.organization_id = ${organizationId}::uuid
      and account.customer_id = ${customerId}::uuid
  `);
  const paidMinor = asMoney(rows[0].paid), bonusMinor = asMoney(rows[0].bonus);
  return { paidMinor, bonusMinor, totalMinor: paidMinor + bonusMinor };
}

/** Test-only issuance must be tied to a confirmed existing booking payment. */
export async function issueSyntheticWalletValue(input: { organizationId: string;
  customerId: string; bookingPaymentId: string; paidMinor: number;
  bonusMinor: number; idempotencyKey: string }): Promise<string> {
  assertSyntheticWallet();
  if (!Number.isSafeInteger(input.paidMinor) || input.paidMinor <= 0 ||
      !Number.isSafeInteger(input.bonusMinor) || input.bonusMinor < 0) {
    throw new AppError("BAD_REQUEST", "Invalid top-up", 400);
  }
  const entitlement = await getEntitlement(input.organizationId, "MEMBERSHIPS_PACKAGES");
  if (!entitlement.enabled) throw new AppError("FEATURE_UNAVAILABLE",
    "New stored value issuance disabled", 503);
  return prisma.$transaction(async transaction => {
    const payment = await transaction.booking_payments.findFirst({ where: {
      id: input.bookingPaymentId, organization_id: input.organizationId,
      status: "PAID", amount_minor: input.paidMinor, currency: "TWD",
      bookings: { customer_id: input.customerId },
    }, select: { id: true, booking_id: true, location_id: true } });
    if (!payment) throw new AppError("NOT_FOUND", "Confirmed payment not found", 404);
    const switchRows = await transaction.$queryRaw<{ isActive: boolean }[]>(Prisma.sql`
      select is_active as "isActive" from public.store_module_activations
      where organization_id=${input.organizationId}::uuid
        and location_id=${payment.location_id}::uuid
        and feature_key='MEMBERSHIPS_PACKAGES'::public.feature_key limit 1
    `);
    if (switchRows[0] && !switchRows[0].isActive) {
      throw new AppError("FEATURE_UNAVAILABLE", "New stored value issuance disabled", 503);
    }
    const accountId = await accountFor(transaction, input.organizationId, input.customerId);
    await lockedBalance(transaction, accountId);
    const existing = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.member_wallet_transactions
      where account_id = ${accountId}::uuid
        and idempotency_hash = ${sha256(input.idempotencyKey)}
    `);
    if (existing[0]) return existing[0].id;
    const previousPayment = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.member_wallet_transactions
      where organization_id = ${input.organizationId}::uuid
        and booking_payment_id = ${payment.id}::uuid and kind = 'TOPUP'
    `);
    if (previousPayment[0]) throw new AppError("CONFLICT", "Payment already issued", 409);
    const total = input.paidMinor + input.bonusMinor;
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.member_wallet_transactions
        (organization_id, account_id, kind, idempotency_hash, booking_id,
         booking_payment_id, amount_minor, paid_minor, bonus_minor, allocation_policy)
      values (${input.organizationId}::uuid, ${accountId}::uuid, 'TOPUP',
        ${sha256(input.idempotencyKey)}, ${payment.booking_id}::uuid,
        ${payment.id}::uuid, ${total}, ${input.paidMinor}, ${input.bonusMinor}, 'ORIGINAL')
      returning id
    `);
    await transaction.$executeRaw(Prisma.sql`
      insert into public.member_wallet_entries (account_id, transaction_id, component, delta_minor)
      values (${accountId}::uuid, ${rows[0].id}::uuid, 'PAID', ${input.paidMinor})
    `);
    if (input.bonusMinor) await transaction.$executeRaw(Prisma.sql`
      insert into public.member_wallet_entries (account_id, transaction_id, component, delta_minor)
      values (${accountId}::uuid, ${rows[0].id}::uuid, 'BONUS', ${input.bonusMinor})
    `);
    return rows[0].id;
  });
}

export async function reserveEntitlement(input: { organizationId: string;
  customerId: string; bookingId: string; amountMinor: number;
  policy: TenderAllocation["policy"]; idempotencyKey: string }):
  Promise<{ reservationId: string; qrToken: string; allocation: TenderAllocation }> {
  assertSyntheticWallet();
  const booking = await prisma.bookings.findFirst({ where: {
    id: input.bookingId, organization_id: input.organizationId,
    customer_id: input.customerId,
  }, select: { id: true } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found", 404);
  const token = randomToken(32);
  return prisma.$transaction(async transaction => {
    const accountId = await accountFor(transaction, input.organizationId, input.customerId);
    const balance = await lockedBalance(transaction, accountId);
    const prior = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.member_wallet_reservations
      where account_id = ${accountId}::uuid
        and idempotency_hash = ${sha256(input.idempotencyKey)}
    `);
    if (prior[0]) throw new AppError("CONFLICT", "Reservation already exists", 409);
    const allocation = allocateTender(input.amountMinor,
      balance.paidMinor, balance.bonusMinor, input.policy);
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.member_wallet_reservations
        (organization_id, account_id, booking_id, idempotency_hash, qr_token_hash,
         amount_minor, paid_minor, bonus_minor, allocation_policy, expires_at)
      values (${input.organizationId}::uuid, ${accountId}::uuid,
        ${input.bookingId}::uuid, ${sha256(input.idempotencyKey)}, ${sha256(token)},
        ${allocation.amountMinor}, ${allocation.paidMinor}, ${allocation.bonusMinor},
        ${input.policy}, now() + interval '5 minutes') returning id
    `);
    return { reservationId: rows[0].id, qrToken: token, allocation };
  });
}

export async function redeemEntitlement(input: { organizationId: string;
  customerId: string; reservationId: string; qrToken: string;
  idempotencyKey: string }): Promise<{ transactionId: string; allocation: TenderAllocation }> {
  assertSyntheticWallet();
  return prisma.$transaction(async transaction => {
    const accountId = await accountFor(transaction, input.organizationId, input.customerId);
    await lockedBalance(transaction, accountId);
    const rows = await transaction.$queryRaw<{ id: string; bookingId: string;
      amountMinor: bigint; paidMinor: bigint; bonusMinor: bigint;
      policy: TenderAllocation["policy"]; status: string; expiresAt: Date;
      redemptionId: string | null }[]>(Prisma.sql`
      select id, booking_id as "bookingId", amount_minor as "amountMinor",
        paid_minor as "paidMinor", bonus_minor as "bonusMinor",
        allocation_policy as policy, status, expires_at as "expiresAt",
        redemption_transaction_id as "redemptionId"
      from public.member_wallet_reservations
      where id = ${input.reservationId}::uuid
        and organization_id = ${input.organizationId}::uuid
        and account_id = ${accountId}::uuid
        and qr_token_hash = ${sha256(input.qrToken)}
      for update
    `);
    const reservation = rows[0];
    if (!reservation) throw new AppError("NOT_FOUND", "Redemption not found", 404);
    const allocation = { amountMinor: asMoney(reservation.amountMinor),
      paidMinor: asMoney(reservation.paidMinor), bonusMinor: asMoney(reservation.bonusMinor),
      policy: reservation.policy };
    if (reservation.status === "REDEEMED") {
      const prior = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        select id from public.member_wallet_transactions
        where id = ${reservation.redemptionId}::uuid
          and idempotency_hash = ${sha256(input.idempotencyKey)}
      `);
      if (prior[0]) return { transactionId: prior[0].id, allocation };
      throw new AppError("CONFLICT", "QR already redeemed", 409);
    }
    if (reservation.status !== "RESERVED" || reservation.expiresAt <= new Date()) {
      throw new AppError("CONFLICT", "QR expired", 409);
    }
    const inserted = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.member_wallet_transactions
        (organization_id, account_id, kind, idempotency_hash, booking_id,
         amount_minor, paid_minor, bonus_minor, allocation_policy)
      values (${input.organizationId}::uuid, ${accountId}::uuid, 'REDEMPTION',
        ${sha256(input.idempotencyKey)}, ${reservation.bookingId}::uuid,
        ${allocation.amountMinor}, ${allocation.paidMinor}, ${allocation.bonusMinor},
        ${allocation.policy}) returning id
    `);
    if (allocation.paidMinor) await transaction.$executeRaw(Prisma.sql`
      insert into public.member_wallet_entries (account_id, transaction_id, component, delta_minor)
      values (${accountId}::uuid, ${inserted[0].id}::uuid, 'PAID', ${-allocation.paidMinor})
    `);
    if (allocation.bonusMinor) await transaction.$executeRaw(Prisma.sql`
      insert into public.member_wallet_entries (account_id, transaction_id, component, delta_minor)
      values (${accountId}::uuid, ${inserted[0].id}::uuid, 'BONUS', ${-allocation.bonusMinor})
    `);
    await transaction.$executeRaw(Prisma.sql`
      update public.member_wallet_reservations
      set status = 'REDEEMED', redemption_transaction_id = ${inserted[0].id}::uuid
      where id = ${reservation.id}::uuid
    `);
    return { transactionId: inserted[0].id, allocation };
  });
}

export async function releaseReservation(input: { organizationId: string;
  customerId: string; reservationId: string }): Promise<void> {
  assertSyntheticWallet();
  await prisma.$transaction(async transaction => {
    const accountId = await accountFor(transaction, input.organizationId, input.customerId);
    await lockedBalance(transaction, accountId);
    const rows = await transaction.$queryRaw<{ status: string }[]>(Prisma.sql`
      select status from public.member_wallet_reservations
      where id = ${input.reservationId}::uuid
        and account_id = ${accountId}::uuid and organization_id = ${input.organizationId}::uuid
      for update
    `);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Reservation not found", 404);
    if (rows[0].status === "REDEEMED") throw new AppError("CONFLICT", "Already redeemed", 409);
    await transaction.$executeRaw(Prisma.sql`
      update public.member_wallet_reservations set status = 'RELEASED'
      where id = ${input.reservationId}::uuid and status = 'RESERVED'
    `);
  });
}

export async function refundSettlement(input: { organizationId: string;
  customerId: string; originalTransactionId: string; bookingRefundId: string;
  amountMinor: number; idempotencyKey: string }):
  Promise<{ transactionId: string; paidMinor: number; bonusMinor: number }> {
  assertSyntheticWallet();
  return prisma.$transaction(async transaction => {
    const accountId = await accountFor(transaction, input.organizationId, input.customerId);
    await lockedBalance(transaction, accountId);
    const original = await transaction.$queryRaw<{ id: string; bookingId: string;
      amountMinor: bigint; paidMinor: bigint; bonusMinor: bigint }[]>(Prisma.sql`
      select id, booking_id as "bookingId", amount_minor as "amountMinor",
        paid_minor as "paidMinor", bonus_minor as "bonusMinor"
      from public.member_wallet_transactions
      where id = ${input.originalTransactionId}::uuid
        and account_id = ${accountId}::uuid and kind = 'REDEMPTION'
      for update
    `);
    if (!original[0]) throw new AppError("NOT_FOUND", "Original redemption not found", 404);
    const refund = await transaction.booking_refunds.findFirst({ where: {
      id: input.bookingRefundId, organization_id: input.organizationId,
      booking_id: original[0].bookingId, status: "CONFIRMED",
      amount_minor: input.amountMinor,
    }, select: { id: true } });
    if (!refund) throw new AppError("NOT_FOUND", "Confirmed refund not found", 404);
    const prior = await transaction.$queryRaw<{ id: string; paidMinor: bigint;
      bonusMinor: bigint }[]>(Prisma.sql`
      select id, paid_minor as "paidMinor", bonus_minor as "bonusMinor"
      from public.member_wallet_transactions
      where account_id = ${accountId}::uuid
        and idempotency_hash = ${sha256(input.idempotencyKey)}
    `);
    if (prior[0]) return { transactionId: prior[0].id,
      paidMinor: asMoney(prior[0].paidMinor), bonusMinor: asMoney(prior[0].bonusMinor) };
    const refunded = await transaction.$queryRaw<{ paid: bigint; bonus: bigint }[]>(Prisma.sql`
      select coalesce(sum(paid_minor),0)::bigint as paid,
        coalesce(sum(bonus_minor),0)::bigint as bonus
      from public.member_wallet_transactions
      where original_transaction_id = ${original[0].id}::uuid and kind = 'REFUND'
    `);
    const originalAmount = asMoney(original[0].amountMinor);
    const remainingPaid = asMoney(original[0].paidMinor - refunded[0].paid);
    const remainingBonus = asMoney(original[0].bonusMinor - refunded[0].bonus);
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
        input.amountMinor > remainingPaid + remainingBonus) {
      throw new AppError("CONFLICT", "Refund exceeds original allocation", 409);
    }
    const paidMinor = input.amountMinor === remainingPaid + remainingBonus ?
      remainingPaid : Math.floor(asMoney(original[0].paidMinor) * input.amountMinor / originalAmount);
    const bonusMinor = input.amountMinor - paidMinor;
    if (paidMinor > remainingPaid || bonusMinor > remainingBonus) {
      throw new AppError("CONFLICT", "Refund allocation exhausted", 409);
    }
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.member_wallet_transactions
        (organization_id, account_id, kind, idempotency_hash, booking_id,
         booking_refund_id, original_transaction_id, amount_minor,
         paid_minor, bonus_minor, allocation_policy)
      values (${input.organizationId}::uuid, ${accountId}::uuid, 'REFUND',
        ${sha256(input.idempotencyKey)}, ${original[0].bookingId}::uuid,
        ${refund.id}::uuid, ${original[0].id}::uuid,
        ${input.amountMinor}, ${paidMinor}, ${bonusMinor}, 'ORIGINAL') returning id
    `);
    if (paidMinor) await transaction.$executeRaw(Prisma.sql`
      insert into public.member_wallet_entries (account_id, transaction_id, component, delta_minor)
      values (${accountId}::uuid, ${rows[0].id}::uuid, 'PAID', ${paidMinor})
    `);
    if (bonusMinor) await transaction.$executeRaw(Prisma.sql`
      insert into public.member_wallet_entries (account_id, transaction_id, component, delta_minor)
      values (${accountId}::uuid, ${rows[0].id}::uuid, 'BONUS', ${bonusMinor})
    `);
    return { transactionId: rows[0].id, paidMinor, bonusMinor };
  });
}
