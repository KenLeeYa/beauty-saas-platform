import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";
import { enableSyntheticMemberEntitlement } from "./member-entitlement-fixture";

import type { VerifiedMobileActor } from "../src/server/auth/line-mobile-session";
import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "locks payroll source versions and moves refund reversal into the next period",
  async () => {
    loadEnvConfig(process.cwd());
    process.env.MEMBER_VALUE_TEST_ONLY = "true";
    process.env.PAYROLL_TEST_ONLY = "true";
    const [{ prisma }, { recordClockEvent }, { capabilitiesForRoles },
      { publishPayrollRule, approveOvertime, approveLeave },
      { calculatePayrollPeriod }, { previewProviderAllocation,
        publishProviderAllocation }, { approvePayrollPeriod, createPayrollAdjustment,
        getPayslip }, { issueSyntheticWalletValue, reserveEntitlement,
        redeemEntitlement }, { randomToken, sha256 }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/staff/attendance"),
      import("../src/server/authorization/capabilities"),
      import("../src/server/payroll/rules"),
      import("../src/server/payroll/calculation"),
      import("../src/server/payroll/segment-allocation"),
      import("../src/server/payroll/approval"),
      import("../src/server/members/ledger"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const ownerId = "33333333-3333-4333-8333-333333333301";
    const overrideId = await enableSyntheticMemberEntitlement(prisma, organizationId, ownerId);
    const variantId = "66666666-6666-4666-8666-666666666611";
    const organization = await prisma.organizations.findUniqueOrThrow({ where: {
      id: organizationId }, select: { slug: true, name: true, status: true } });
    const location = await prisma.locations.findUniqueOrThrow({ where: { id: locationId },
      select: { slug: true, name: true, timezone: true } });
    const unique = randomToken(8).replace(/[^a-zA-Z0-9]/g,"x");
    const profile = await prisma.profiles.create({ data: {
      email: `payroll-${unique}@example.test`, display_name: "Payroll synthetic",
    }, select: { id: true } });
    await prisma.location_memberships.create({ data: {
      organization_id: organizationId, location_id: locationId,
      profile_id: profile.id, role: "SERVICE_PROVIDER", status: "ACTIVE",
    } });
    const staff = await prisma.staff_profiles.create({ data: {
      organization_id: organizationId, linked_profile_id: profile.id,
      display_name: "Payroll synthetic",
    }, select: { id: true } });
    const manager: OrganizationContext = { session: { id: randomToken(16),
      profileId: ownerId, email: "owner@example.test", displayName: "Owner",
      platformRole: null, expiresAt: new Date(Date.now()+60_000), csrfTokenHash: "" },
      organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationId]),
      linkedStaffProfileId: null };
    const actor: VerifiedMobileActor = { kind: "employee", sessionId: randomToken(16),
      organizationId, locationId, profileId: profile.id, customerId: null,
      capabilities: capabilitiesForRoles(["SERVICE_PROVIDER"]) };
    const clock = (kind: "CLOCK_IN"|"BREAK_START"|"BREAK_END"|"CLOCK_OUT",
      at: string) => recordClockEvent(actor, locationId, kind, new Date(at),
      randomToken(24), new Date(at));
    const clockIn = await clock("CLOCK_IN","2026-10-04T23:00:00Z");
    await clock("BREAK_START","2026-10-05T03:00:00Z");
    await clock("BREAK_END","2026-10-05T03:30:00Z");
    await clock("CLOCK_OUT","2026-10-05T09:30:00Z");
    await approveLeave({ context: manager, profileId: profile.id,
      startsAt: new Date("2026-10-05T10:00:00Z"),
      endsAt: new Date("2026-10-05T12:00:00Z"),
      paid: true, reason: "synthetic approved leave" });
    const ruleRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.payroll_rule_versions
        (organization_id,location_id,profile_id,rule_key,version,
         hourly_rate_minor,base_per_period_minor,overtime_multiplier_bps,
         effective_from,effective_until,created_by_profile_id)
      values (${organizationId}::uuid,${locationId}::uuid,${profile.id}::uuid,
        ${`PAYROLL_${unique.toUpperCase()}`},1,12000,50000,15000,
        '2026-10-01'::date,'2026-12-01'::date,${ownerId}::uuid) returning id
    `);
    const ruleId = ruleRows[0].id;
    await publishPayrollRule({ context: manager, ruleId, requestId: randomToken(12) });
    const commissionRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.commission_rule_versions
        (organization_id,location_id,service_variant_id,staff_profile_id,
         rule_key,version,priority,basis,rate_bps,effective_from,effective_until,
         created_by_profile_id)
      values (${organizationId}::uuid,${locationId}::uuid,${variantId}::uuid,
        ${staff.id}::uuid,${`COMMISSION_${unique.toUpperCase()}`},1,
        999999,'PAID_COMPONENT',4000,
        '2026-10-01T00:00:00Z','2026-12-01T00:00:00Z',${ownerId}::uuid)
      returning id
    `);
    await prisma.$executeRaw(Prisma.sql`
      update public.commission_rule_versions set published_at=now(),
        published_by_profile_id=${ownerId}::uuid where id=${commissionRows[0].id}::uuid
    `);
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Payroll buyer",
    }, select: { id: true } });
    const booking = await prisma.bookings.create({ data: {
      organization_id: organizationId, location_id: locationId,
      customer_id: customer.id, status: "COMPLETED", payment_status: "PAID",
      subtotal_minor: 100000, discount_minor: 20000, total_minor: 80000,
      paid_minor: 80000, tracking_token_hash: sha256(randomToken(32)),
      is_test: true, completed_at: new Date("2026-10-05T08:00:00Z"),
    }, select: { id: true } });
    await prisma.booking_segments.create({ data: {
      organization_id: organizationId, location_id: locationId,
      booking_id: booking.id, service_variant_id: variantId,
      assigned_staff_id: staff.id, service_name_snapshot: "Synthetic service",
      variant_name_snapshot: "Synthetic variant",
      staff_name_snapshot: "Payroll synthetic",
      starts_at: new Date("2026-10-05T07:00:00Z"),
      ends_at: new Date("2026-10-05T08:00:00Z"),
      duration_minutes: 60, price_minor: 100000,
    } });
    const payment = await prisma.booking_payments.create({ data: {
      organization_id: organizationId, location_id: locationId,
      booking_id: booking.id, method: "MANUAL_TRANSFER", status: "PAID",
      amount_minor: 60000, currency: "TWD", confirmed_by: ownerId,
      confirmed_at: new Date(),
    }, select: { id: true } });
    await issueSyntheticWalletValue({ organizationId, customerId: customer.id,
      bookingPaymentId: payment.id, paidMinor: 60000, bonusMinor: 20000,
      idempotencyKey: randomToken(24) });
    const reserve = await reserveEntitlement({ organizationId,
      customerId: customer.id, bookingId: booking.id, amountMinor: 80000,
      policy: "PAID_FIRST", idempotencyKey: randomToken(24) });
    await redeemEntitlement({ organizationId, customerId: customer.id,
      reservationId: reserve.reservationId, qrToken: reserve.qrToken,
      idempotencyKey: randomToken(24) });
    try {
      const input = { context: manager, employeeId: profile.id,
        from: "2026-10-05", until: "2026-10-06", ruleId };
      const first = await calculatePayrollPeriod(input);
      expect(first.lines.find(line => line.kind === "COMMISSION")?.amountMinor).toBe(24000);
      expect(first.lines.find(line => line.kind === "PAID_LEAVE")?.amountMinor).toBe(0);
      expect(first.lines.find(line => line.kind === "REVIEW_TIME")?.minutes).toBe(120);
      expect(first.totalMinor).toBe(170000);
      await approveOvertime({ context: manager, clockInEventId: clockIn,
        approvedMinutes: 60, reason: "synthetic overtime" });
      await expect(approvePayrollPeriod({ context: manager, periodId: first.periodId,
        reviewReason: "pending overtime", requestId: randomToken(12) }))
        .rejects.toMatchObject({ status: 409 });
      const second = await calculatePayrollPeriod(input);
      expect(second.revision).toBe(2);
      expect(second.lines.find(line => line.kind === "OVERTIME")?.amountMinor).toBe(18000);
      expect(second.lines.find(line => line.kind === "REVIEW_TIME")?.minutes).toBe(60);
      expect(second.totalMinor).toBe(188000);
      await expect(approvePayrollPeriod({ context: manager, periodId: second.periodId,
        requestId: randomToken(12) })).rejects.toMatchObject({ status: 400 });
      await approvePayrollPeriod({ context: manager, periodId: second.periodId,
        reviewReason: "60 minutes pending review", requestId: randomToken(12) });
      await expect(calculatePayrollPeriod(input)).rejects.toThrow("period is locked");
      const ownContext: OrganizationContext = { ...manager,
        session: { ...manager.session, profileId: profile.id },
        roles: new Set(["SERVICE_PROVIDER"]), allLocations: false };
      expect((await getPayslip(ownContext,second.periodId)).totalMinor).toBe(188000);
      await expect(getPayslip({ ...manager, roles: new Set(["FRONT_DESK"]) },
        second.periodId)).rejects.toMatchObject({ status: 403 });
      await expect(prisma.$executeRaw(Prisma.sql`
        update public.payroll_lines set amount_minor=0
        where period_id=${second.periodId}::uuid
      `)).rejects.toBeTruthy();
      const refund = await prisma.booking_refunds.create({ data: {
        organization_id: organizationId, booking_id: booking.id,
        booking_payment_id: payment.id, status: "CONFIRMED",
        amount_minor: 40000, reason: "synthetic refund",
        recorded_by: ownerId, confirmed_by: ownerId, confirmed_at: new Date(),
      }, select: { id: true } });
      const adjustmentKey = randomToken(24);
      const adjustment = await createPayrollAdjustment({ context: manager,
        originalPeriodId: second.periodId, bookingRefundId: refund.id,
        appliesOn: "2026-11-01", idempotencyKey: adjustmentKey });
      expect(adjustment.amountMinor).toBe(-12000);
      expect(await createPayrollAdjustment({ context: manager,
        originalPeriodId: second.periodId, bookingRefundId: refund.id,
        appliesOn: "2026-11-01", idempotencyKey: adjustmentKey }))
        .toEqual(adjustment);
      const next = await calculatePayrollPeriod({ ...input,
        from: "2026-11-01", until: "2026-11-02" });
      expect(next.lines.find(line => line.kind === "ADJUSTMENT")?.amountMinor)
        .toBe(-12000);
      expect(next.totalMinor).toBe(38000);
      const secondRefund = await prisma.booking_refunds.create({ data: {
        organization_id: organizationId, booking_id: booking.id,
        booking_payment_id: payment.id, status: "CONFIRMED",
        amount_minor: 20000, reason: "second synthetic refund",
        recorded_by: ownerId, confirmed_by: ownerId, confirmed_at: new Date(),
      }, select: { id: true } });
      expect((await createPayrollAdjustment({ context: manager,
        originalPeriodId: second.periodId, bookingRefundId: secondRefund.id,
        appliesOn: "2026-11-01", idempotencyKey: randomToken(24) })).amountMinor)
        .toBe(-6000);
      const revisedNext = await calculatePayrollPeriod({ ...input,
        from: "2026-11-01", until: "2026-11-02" });
      expect(revisedNext.revision).toBe(2);
      expect(revisedNext.totalMinor).toBe(32000);
      expect((await getPayslip(manager,second.periodId)).totalMinor).toBe(188000);
      const bundled = await prisma.bookings.create({ data: {
        organization_id: organizationId, location_id: locationId,
        customer_id: customer.id, status: "COMPLETED", payment_status: "PAID",
        subtotal_minor: 100000, discount_minor: 20000, total_minor: 80000,
        paid_minor: 80000, tracking_token_hash: sha256(randomToken(32)),
        is_test: true, completed_at: new Date("2026-10-07T08:00:00Z"),
      }, select: { id: true } });
      for (const [order, price] of [[0,60000],[1,40000]]) {
        await prisma.booking_segments.create({ data: {
          organization_id: organizationId, location_id: locationId,
          booking_id: bundled.id, service_variant_id: variantId,
          assigned_staff_id: staff.id, service_name_snapshot: "Bundled service",
          variant_name_snapshot: `Part ${order}`, staff_name_snapshot: "Payroll synthetic",
          starts_at: new Date(`2026-10-07T0${order+6}:00:00Z`),
          ends_at: new Date(`2026-10-07T0${order+7}:00:00Z`),
          duration_minutes: 60, price_minor: price, sort_order: order,
        } });
      }
      const bundlePayroll = await calculatePayrollPeriod({ ...input,
        from: "2026-10-07", until: "2026-10-08" });
      expect(bundlePayroll.lines.filter(line => line.kind === "COMMISSION")
        .map(line => line.amountMinor).sort((a,b) => a-b)).toEqual([12800,19200]);
      expect(bundlePayroll.totalMinor).toBe(82000);
      const secondProfile = await prisma.profiles.create({ data: {
        email: `second-${unique}@example.test`, display_name: "Second synthetic provider",
      }, select: { id: true } });
      const secondStaff = await prisma.staff_profiles.create({ data: {
        organization_id: organizationId, linked_profile_id: secondProfile.id,
        display_name: "Second synthetic provider",
      }, select: { id: true } });
      const shared = await prisma.bookings.create({ data: {
        organization_id: organizationId, location_id: locationId,
        customer_id: customer.id, status: "COMPLETED", payment_status: "PAID",
        subtotal_minor: 10000, discount_minor: 0, total_minor: 10000,
        paid_minor: 10000, tracking_token_hash: sha256(randomToken(32)),
        is_test: true, completed_at: new Date("2026-10-08T08:00:00Z"),
      }, select: { id: true, version: true } });
      const sharedSegment = await prisma.booking_segments.create({ data: {
        organization_id: organizationId, location_id: locationId,
        booking_id: shared.id, service_variant_id: variantId,
        assigned_staff_id: staff.id, service_name_snapshot: "Shared synthetic service",
        variant_name_snapshot: "Two providers", staff_name_snapshot: "Payroll synthetic",
        starts_at: new Date("2026-10-08T07:00:00Z"),
        ends_at: new Date("2026-10-08T08:00:00Z"),
        duration_minutes: 60, price_minor: 10000,
      }, select: { id: true } });
      await prisma.booking_staff_allocations.create({ data: {
        organization_id: organizationId, location_id: locationId,
        booking_id: shared.id, booking_segment_id: sharedSegment.id,
        staff_profile_id: secondStaff.id,
        starts_at: new Date("2026-10-08T07:00:00Z"),
        ends_at: new Date("2026-10-08T08:00:00Z"),
      } });
      const sharedInput = { ...input, from: "2026-10-08", until: "2026-10-09" };
      await expect(calculatePayrollPeriod(sharedInput)).rejects.toThrow(
        "Published multi-provider allocation required");
      const percent = { context: manager, bookingSegmentId: sharedSegment.id,
        method: "PERCENT" as const, lines: [
          { staffProfileId: staff.id, shareBps: 6000 },
          { staffProfileId: secondStaff.id, shareBps: 4000 },
        ], requestId: randomToken(12) };
      await expect(previewProviderAllocation({ ...percent,
        lines: [{ staffProfileId: staff.id, shareBps: 7000 },
          { staffProfileId: secondStaff.id, shareBps: 4000 }] }))
        .rejects.toMatchObject({ status: 400 });
      await expect(previewProviderAllocation({ ...percent,
        context: { ...manager, roles: new Set(["FRONT_DESK"]) } }))
        .rejects.toMatchObject({ status: 403 });
      const quote = await previewProviderAllocation(percent);
      expect(quote.commissionPoolMinor).toBe(4000);
      expect(quote.lines.map(line => line.quotedMinor)).toEqual([2400,1600]);
      await expect(publishProviderAllocation({ ...percent,
        expectedBookingVersion: shared.version+1 })).rejects.toMatchObject({ status: 409 });
      await publishProviderAllocation({ ...percent,
        expectedBookingVersion: shared.version });
      const allocated = await calculatePayrollPeriod(sharedInput);
      expect(allocated.lines.find(line => line.kind === "COMMISSION")?.amountMinor)
        .toBe(2400);
      const fixed = { context: manager, bookingSegmentId: sharedSegment.id,
        method: "FIXED" as const, lines: [
          { staffProfileId: staff.id, fixedMinor: 2000 },
          { staffProfileId: secondStaff.id, fixedMinor: 1000 },
        ], expectedVersion: 1, requestId: randomToken(12) };
      expect((await previewProviderAllocation(fixed)).lines.map(line =>
        line.quotedMinor)).toEqual([2000,1000]);
      await publishProviderAllocation({ ...fixed,
        expectedBookingVersion: shared.version });
      const revised = await calculatePayrollPeriod(sharedInput);
      expect(revised.lines.find(line => line.kind === "COMMISSION")?.amountMinor)
        .toBe(2000);
      await approvePayrollPeriod({ context: manager, periodId: revised.periodId,
        reviewReason: "synthetic shared service", requestId: randomToken(12) });
      await expect(publishProviderAllocation({ ...percent, expectedVersion: 2,
        expectedBookingVersion: shared.version })).rejects.toMatchObject({ status: 409 });
      const oldEnvironment = process.env.APP_ENV;
      process.env.APP_ENV = "production";
      try {
        await expect(calculatePayrollPeriod(input)).rejects.toMatchObject({ status: 503 });
      } finally { process.env.APP_ENV = oldEnvironment; }
    } finally {
      delete process.env.MEMBER_VALUE_TEST_ONLY;
      delete process.env.PAYROLL_TEST_ONLY;
      await prisma.organization_feature_overrides.delete({ where: { id: overrideId } });
    }
  }, 120_000,
);
