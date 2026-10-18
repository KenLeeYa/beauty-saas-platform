import "server-only";

import { Prisma } from "@prisma/client";

import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { sha256 } from "../security/crypto";
import { formatDateInTimeZone, zonedDateTimeToUtc } from "../time/timezone";
import { summarizeAttendance, type AttendanceEvent } from "../staff/attendance";
import { quoteCommission, type CommissionRuleVersion } from "./commission-quote";

export type PayrollLineDraft = { kind: "BASE" | "HOURLY" | "OVERTIME" |
  "PAID_LEAVE" | "COMMISSION" | "REVIEW_TIME" | "ADJUSTMENT";
  sourceRef: string; amountMinor: number; minutes: number | null;
  ruleVersion: number; detail: Record<string, string | number | boolean | null> };

type PayrollRule = { id: string; version: number; hourlyRateMinor: number;
  baseMinor: number; overtimeBps: number; approvedOnly: boolean };
type ClockRow = AttendanceEvent & { profileId: string };
type LeaveRow = { id: string; startsAt: Date; endsAt: Date; paid: boolean };
type OvertimeRow = { id: string; clockInId: string; approvedMinutes: number };
type SegmentRow = { id: string; bookingId: string; bookingVersion: number;
  completedAt: Date; serviceVariantId: string; staffProfileId: string;
  listPriceMinor: number; bookingTotalMinor: number; refundedMinor: number;
  siblings: Array<{ id: string; priceMinor: number }>;
  walletBonusMinor: bigint };
type AdjustmentRow = { id: string; amountMinor: bigint };

export type PayrollSnapshot = { sourceHash: string; lines: PayrollLineDraft[];
  totalMinor: number; rule: PayrollRule };

function assertLocalPayroll(): void {
  if (process.env.APP_ENV !== "test" || process.env.PAYROLL_TEST_ONLY !== "true") {
    throw new AppError("FEATURE_UNAVAILABLE", "Payroll is not activated", 503);
  }
}

function validPeriod(from: string, until: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
      from >= until || (Date.parse(`${until}T00:00:00Z`) -
        Date.parse(`${from}T00:00:00Z`)) > 62 * 86400_000) {
    throw new AppError("BAD_REQUEST", "Invalid payroll period", 400);
  }
}

export async function buildPayrollSnapshot(client: Prisma.TransactionClient,
  input: { organizationId: string; locationId: string; profileId: string;
    timezone: string; from: string; until: string; ruleId: string }):
  Promise<PayrollSnapshot> {
  validPeriod(input.from, input.until);
  const start = zonedDateTimeToUtc(input.from, "00:00", input.timezone);
  const end = zonedDateTimeToUtc(input.until, "00:00", input.timezone);
  const rules = await client.$queryRaw<PayrollRule[]>(Prisma.sql`
    select id, version, hourly_rate_minor as "hourlyRateMinor",
      base_per_period_minor as "baseMinor",
      overtime_multiplier_bps as "overtimeBps",
      approved_overtime_only as "approvedOnly"
    from public.payroll_rule_versions
    where id = ${input.ruleId}::uuid
      and organization_id = ${input.organizationId}::uuid
      and (location_id is null or location_id = ${input.locationId}::uuid)
      and (profile_id is null or profile_id = ${input.profileId}::uuid)
      and published_at is not null
      and effective_from <= ${input.from}::date
      and effective_until >= ${input.until}::date
  `);
  const rule = rules[0];
  if (!rule) throw new AppError("NOT_FOUND", "Effective payroll rule not found", 404);
  const [events, leaves, overtime, segments, commissionRules, adjustments, settings] =
    await Promise.all([
      client.$queryRaw<ClockRow[]>(Prisma.sql`
        select event.id, event.location_id as "locationId", event.profile_id as "profileId",
          event.kind, event.occurred_at as "occurredAt",
          correction.corrected_at as "correctedAt"
        from public.staff_attendance_events event
        left join public.staff_attendance_corrections correction on correction.event_id=event.id
        where event.organization_id=${input.organizationId}::uuid
          and event.profile_id=${input.profileId}::uuid
          and coalesce(correction.corrected_at,event.occurred_at) >= ${new Date(start.getTime()-86400_000)}
          and coalesce(correction.corrected_at,event.occurred_at) < ${new Date(end.getTime()+86400_000)}
        order by coalesce(correction.corrected_at,event.occurred_at),event.recorded_at
      `),
      client.$queryRaw<LeaveRow[]>(Prisma.sql`
        select id, starts_at as "startsAt", ends_at as "endsAt", paid
        from public.payroll_leave_approvals
        where organization_id=${input.organizationId}::uuid
          and location_id=${input.locationId}::uuid
          and profile_id=${input.profileId}::uuid
          and starts_at>=${start} and starts_at<${end}
      `),
      client.$queryRaw<OvertimeRow[]>(Prisma.sql`
        select approval.id, approval.clock_in_event_id as "clockInId",
          approval.approved_minutes as "approvedMinutes"
        from public.payroll_overtime_approvals approval
        join public.staff_attendance_events event on event.id=approval.clock_in_event_id
        where approval.organization_id=${input.organizationId}::uuid
          and event.profile_id=${input.profileId}::uuid
      `),
      client.$queryRaw<SegmentRow[]>(Prisma.sql`
        select segment.id, booking.id as "bookingId", booking.version as "bookingVersion",
          booking.completed_at as "completedAt",
          segment.service_variant_id as "serviceVariantId",
          segment.assigned_staff_id as "staffProfileId",
          segment.price_minor as "listPriceMinor",
          booking.total_minor as "bookingTotalMinor",
          booking.refunded_minor as "refundedMinor",
          (select json_agg(json_build_object('id',sibling.id,
            'priceMinor',sibling.price_minor)
            order by sibling.sort_order,sibling.id)
            from public.booking_segments sibling
            where sibling.booking_id=booking.id) as siblings,
          coalesce((select sum(wallet.bonus_minor)
            from public.member_wallet_transactions wallet
            where wallet.booking_id=booking.id and wallet.kind='REDEMPTION'),0)::bigint
            as "walletBonusMinor"
        from public.booking_segments segment
        join public.bookings booking on booking.id=segment.booking_id
          and booking.organization_id=segment.organization_id
        where segment.organization_id=${input.organizationId}::uuid
          and segment.location_id=${input.locationId}::uuid
          and exists (select 1 from public.staff_profiles staff
            where staff.organization_id=segment.organization_id
              and staff.linked_profile_id=${input.profileId}::uuid
              and (staff.id=segment.assigned_staff_id or exists (
                select 1 from public.booking_staff_allocations allocation
                where allocation.organization_id=segment.organization_id
                  and allocation.booking_segment_id=segment.id
                  and allocation.staff_profile_id=staff.id)))
          and booking.status='COMPLETED' and booking.completed_at>=${start}
          and booking.completed_at<${end}
        order by booking.completed_at,segment.id
      `),
      client.$queryRaw<CommissionRuleVersion[]>(Prisma.sql`
        select id, version, priority, organization_id as "organizationId",
          location_id as "locationId", service_variant_id as "serviceVariantId",
          staff_profile_id as "staffProfileId", basis, rate_bps as "rateBps",
          fixed_minor as "fixedMinor", exclude_fee_tax as "excludeFeeTax",
          effective_from as "effectiveFrom", effective_until as "effectiveUntil"
        from public.commission_rule_versions
        where organization_id=${input.organizationId}::uuid and published_at is not null
          and effective_from<${end} and effective_until>${start}
      `),
      client.$queryRaw<AdjustmentRow[]>(Prisma.sql`
        select id, amount_minor as "amountMinor" from public.payroll_adjustments
        where organization_id=${input.organizationId}::uuid
          and profile_id=${input.profileId}::uuid
          and applies_on>=${input.from}::date and applies_on<${input.until}::date
      `),
      client.$queryRaw<{ standardMinutes: number }[]>(Prisma.sql`
        select standard_daily_minutes as "standardMinutes"
        from public.staff_attendance_settings
        where organization_id=${input.organizationId}::uuid
      `),
    ]);
  const standardMinutes = settings[0]?.standardMinutes ?? 480;
  const lines: PayrollLineDraft[] = [];
  if (rule.baseMinor) lines.push({ kind: "BASE", sourceRef: rule.id,
    amountMinor: rule.baseMinor, minutes: null, ruleVersion: rule.version,
    detail: { basis: "period base" } });
  let shift: ClockRow[] = [];
  for (const event of events) {
    if (event.kind === "CLOCK_IN") shift = [event];
    else if (shift.length) shift.push(event);
    if (event.kind !== "CLOCK_OUT" || !shift.length) continue;
    const clockIn = shift[0];
    const clockDate = formatDateInTimeZone(clockIn.correctedAt ?? clockIn.occurredAt,
      input.timezone);
    if (clockIn.locationId === input.locationId && clockDate >= input.from &&
        clockDate < input.until) {
      const summary = summarizeAttendance(shift, input.timezone, standardMinutes);
      const approved = overtime.find(row => row.clockInId === clockIn.id)?.approvedMinutes ?? 0;
      const payableOvertime = rule.approvedOnly ?
        Math.min(approved, summary.overtimeUnapprovedMinutes) :
        summary.overtimeUnapprovedMinutes;
      const baseMinutes = summary.workedMinutes - summary.overtimeUnapprovedMinutes;
      lines.push({ kind: "HOURLY", sourceRef: clockIn.id,
        amountMinor: Math.floor(rule.hourlyRateMinor * baseMinutes / 60),
        minutes: baseMinutes, ruleVersion: rule.version,
        detail: { breakMinutes: summary.breakMinutes, overnight: summary.overnight } });
      if (payableOvertime) lines.push({ kind: "OVERTIME", sourceRef: clockIn.id,
        amountMinor: Math.floor(rule.hourlyRateMinor * rule.overtimeBps *
          payableOvertime / 600000), minutes: payableOvertime,
        ruleVersion: rule.version, detail: { approved: true } });
      const reviewMinutes = summary.overtimeUnapprovedMinutes - payableOvertime;
      if (reviewMinutes) lines.push({ kind: "REVIEW_TIME", sourceRef: clockIn.id,
        amountMinor: 0, minutes: reviewMinutes, ruleVersion: rule.version,
        detail: { approved: false } });
    }
    shift = [];
  }
  if (shift.length && shift[0].locationId === input.locationId) {
    lines.push({ kind: "REVIEW_TIME", sourceRef: shift[0].id,
      amountMinor: 0, minutes: null, ruleVersion: rule.version,
      detail: { incomplete: true } });
  }
  for (const leave of leaves) if (leave.paid) {
    const minutes = Math.floor((leave.endsAt.getTime()-leave.startsAt.getTime())/60_000);
    lines.push({ kind: "PAID_LEAVE", sourceRef: leave.id,
      amountMinor: rule.baseMinor ? 0 : Math.floor(rule.hourlyRateMinor*minutes/60),
      minutes, ruleVersion: rule.version, detail: { paid: true } });
  }
  for (const segment of segments) {
    if (!segment.serviceVariantId || !segment.siblings?.length ||
        segment.siblings.some(row => !Number.isSafeInteger(row.priceMinor) ||
          row.priceMinor < 0) || segment.siblings.every(row => row.priceMinor === 0)) {
      lines.push({ kind: "REVIEW_TIME", sourceRef: segment.id,
        amountMinor: 0, minutes: null, ruleVersion: rule.version,
        detail: { invalidCommissionAllocation: true } });
      continue;
    }
    const split = (amount: number) => {
      const totalList = segment.siblings.reduce((sum,row) => sum+row.priceMinor,0);
      const index = segment.siblings.findIndex(row => row.id === segment.id);
      if (index < 0 || !Number.isSafeInteger(amount) || amount < 0) {
        throw new AppError("CONFLICT", "Invalid commission source allocation", 409);
      }
      return index === segment.siblings.length-1 ? amount -
        segment.siblings.slice(0,-1).reduce((sum,row) =>
          sum+Math.floor(amount*row.priceMinor/totalList),0) :
        Math.floor(amount*segment.siblings[index].priceMinor/totalList);
    };
    const discounted = split(segment.bookingTotalMinor);
    const bonus = Math.min(discounted,split(Number(segment.walletBonusMinor)));
    const refunded = Math.min(discounted,split(segment.refundedMinor));
    if (discounted > segment.listPriceMinor) {
      lines.push({ kind: "REVIEW_TIME", sourceRef: segment.id,
        amountMinor: 0, minutes: null, ruleVersion: rule.version,
        detail: { priceExceedsSegment: true } });
      continue;
    }
    const providers = await client.$queryRaw<{ staffId: string; profileId: string | null }[]>(Prisma.sql`
      select distinct staff.id as "staffId",staff.linked_profile_id as "profileId"
      from public.staff_profiles staff
      where staff.organization_id=${input.organizationId}::uuid
        and (staff.id=${segment.staffProfileId}::uuid or exists (
          select 1 from public.booking_staff_allocations allocation
          where allocation.organization_id=${input.organizationId}::uuid
            and allocation.booking_segment_id=${segment.id}::uuid
            and allocation.staff_profile_id=staff.id))
    `);
    if (providers.length > 1) {
      const allocations = await client.$queryRaw<{ id: string; version: number;
        bookingVersion: number;
        segmentPriceMinor: number; staffId: string; quotedMinor: number }[]>(Prisma.sql`
        select allocation.id,allocation.version,
          allocation.booking_version as "bookingVersion",
          allocation.segment_price_minor as "segmentPriceMinor",
          line.staff_profile_id as "staffId",line.quoted_minor as "quotedMinor"
        from public.commission_segment_allocation_sets allocation
        join public.commission_segment_allocation_lines line
          on line.allocation_set_id=allocation.id
        where allocation.organization_id=${input.organizationId}::uuid
          and allocation.location_id=${input.locationId}::uuid
          and allocation.booking_segment_id=${segment.id}::uuid
        order by allocation.version desc
      `);
      const latest = allocations[0];
      const current = allocations.filter(row => row.id === latest?.id);
      if (!latest || latest.segmentPriceMinor !== discounted ||
          latest.bookingVersion !== segment.bookingVersion ||
          providers.some(provider => !provider.profileId) ||
          current.length !== providers.length ||
          providers.some(provider => !current.some(row => row.staffId === provider.staffId))) {
        throw new AppError("CONFLICT", "Published multi-provider allocation required", 409);
      }
      const staffId = providers.find(provider => provider.profileId === input.profileId)?.staffId;
      const mine = current.find(row => row.staffId === staffId);
      if (!mine) throw new AppError("CONFLICT", "Provider allocation missing", 409);
      lines.push({ kind: "COMMISSION",
        sourceRef: `${segment.id}:ALLOCATION:${latest.version}:${staffId}`,
        amountMinor: mine.quotedMinor, minutes: null, ruleVersion: latest.version,
        detail: { bookingId: segment.bookingId, allocationId: latest.id,
          refunded: false } });
      if (refunded > 0) lines.push({ kind: "COMMISSION",
        sourceRef: `${segment.id}:ALLOCATION:${latest.version}:${staffId}:REFUND`,
        amountMinor: -Math.floor(mine.quotedMinor*refunded/discounted),
        minutes: null, ruleVersion: latest.version,
        detail: { bookingId: segment.bookingId, allocationId: latest.id,
          refunded: true } });
      continue;
    }
    const commissionSegment = { id: segment.id,
      organizationId: input.organizationId, locationId: input.locationId,
      serviceVariantId: segment.serviceVariantId,
      staffProfileIds: [segment.staffProfileId], listPriceMinor: segment.listPriceMinor,
      discountedPriceMinor: discounted, paymentFeeMinor: 0, taxMinor: 0,
      completedAt: segment.completedAt };
    const tender = { paidMinor: discounted-bonus, bonusMinor: bonus };
    const quoted = quoteCommission([commissionSegment], tender, commissionRules);
    for (const quote of quoted) lines.push({ kind: "COMMISSION",
      sourceRef: `${segment.id}:${quote.ruleId}`,
      amountMinor: quote.commissionMinor, minutes: null,
      ruleVersion: quote.ruleVersion,
      detail: { bookingId: segment.bookingId, ruleId: quote.ruleId,
        basisMinor: quote.basisMinor, refunded: false } });
    if (refunded > 0) {
      const reversals = quoteCommission([{ ...commissionSegment,
        refundMinor: refunded }],
        tender, commissionRules);
      for (const quote of reversals) lines.push({ kind: "COMMISSION",
        sourceRef: `${segment.id}:${quote.ruleId}:REFUND`,
        amountMinor: quote.commissionMinor, minutes: null,
        ruleVersion: quote.ruleVersion,
        detail: { bookingId: segment.bookingId, ruleId: quote.ruleId,
          basisMinor: quote.basisMinor, refunded: true } });
    }
  }
  for (const adjustment of adjustments) lines.push({ kind: "ADJUSTMENT",
    sourceRef: adjustment.id, amountMinor: Number(adjustment.amountMinor),
    minutes: null, ruleVersion: rule.version, detail: { refundLinked: true } });
  const sourceHash = sha256(JSON.stringify({ rule,
    events: events.map(row => [row.id,row.occurredAt,row.correctedAt]),
    leaves, overtime, segments, commissionRules: commissionRules.map(row => [row.id,row.version]),
    adjustments, lines }, (_key, value) => typeof value === "bigint" ? value.toString() : value));
  const totalMinor = lines.reduce((sum,line) => sum+line.amountMinor,0);
  if (!Number.isSafeInteger(totalMinor)) throw new AppError("INTERNAL_ERROR", "Payroll overflow", 500);
  return { sourceHash, lines, totalMinor, rule };
}

export async function calculatePayrollPeriod(input: { context: OrganizationContext;
  employeeId: string; from: string; until: string; ruleId: string }):
  Promise<{ periodId: string; revision: number; totalMinor: number;
    lines: PayrollLineDraft[] }> {
  assertLocalPayroll();
  assertCapability(input.context, "billing.manage");
  const location = requireLocation(input.context);
  return prisma.$transaction(async transaction => {
    const approved = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.payroll_periods
      where organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid
        and profile_id=${input.employeeId}::uuid
        and period_from=${input.from}::date and period_until=${input.until}::date
        and status='APPROVED' limit 1
    `);
    if (approved[0]) throw new AppError("CONFLICT", "Payroll period is locked", 409);
    const snapshot = await buildPayrollSnapshot(transaction, {
      organizationId: input.context.organization.id, locationId: location.id,
      profileId: input.employeeId, timezone: location.timezone,
      from: input.from, until: input.until, ruleId: input.ruleId });
    const versions = await transaction.$queryRaw<{ revision: number }[]>(Prisma.sql`
      select coalesce(max(revision),0)::int as revision from public.payroll_periods
      where organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid
        and profile_id=${input.employeeId}::uuid
        and period_from=${input.from}::date and period_until=${input.until}::date
    `);
    const revision = versions[0].revision+1;
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.payroll_periods
        (organization_id,location_id,profile_id,period_from,period_until,
         revision,source_hash,rule_id,total_minor,created_by_profile_id)
      values (${input.context.organization.id}::uuid,${location.id}::uuid,
        ${input.employeeId}::uuid,${input.from}::date,${input.until}::date,
        ${revision},${snapshot.sourceHash},${input.ruleId}::uuid,
        ${snapshot.totalMinor},${input.context.session.profileId}::uuid) returning id
    `);
    for (const line of snapshot.lines) await transaction.$executeRaw(Prisma.sql`
      insert into public.payroll_lines
        (period_id,kind,source_ref,amount_minor,minutes,rule_version,detail)
      values (${rows[0].id}::uuid,${line.kind},${line.sourceRef},
        ${line.amountMinor},${line.minutes},${line.ruleVersion},
        ${JSON.stringify(line.detail)}::jsonb)
    `);
    return { periodId: rows[0].id, revision, totalMinor: snapshot.totalMinor,
      lines: snapshot.lines };
  }, { isolationLevel: "Serializable" });
}
