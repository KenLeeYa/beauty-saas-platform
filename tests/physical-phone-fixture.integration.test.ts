import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {expect, it} from 'vitest';
import {z} from 'zod';

const file = '.dev-logs/physical-phone-fixture.json';
const receiptSchema = z.object({bookingId: z.string().uuid(), customerId: z.string().uuid(),
  staffIds: z.array(z.string().uuid()).length(3), segmentIds: z.array(z.string().uuid()).length(2)});

it.skipIf(!process.env.BEAUTY_PHYSICAL_FIXTURE)('prepares or checks isolated physical-phone arrangements', async () => {
  expect(process.env.APP_ENV).toBe('test');
  expect(new URL(process.env.DATABASE_URL!).hostname).toBe('127.0.0.1');
  expect(new URL(process.env.DATABASE_URL!).pathname).toBe('/beauty_msi_20261009');
  const {prisma} = await import('../src/server/database/prisma');
  const mode = process.env.BEAUTY_PHYSICAL_FIXTURE;
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222221';
  if (mode !== 'prepare') {
    const receipt = receiptSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const booking = await prisma.bookings.findFirstOrThrow({where: {id: receipt.bookingId,
      organization_id: organizationId, location_id: locationId, is_test: true}, include: {
      booking_segments: {orderBy: {sort_order: 'asc'}}, booking_staff_allocations: true, booking_events: true}});
    if (mode === 'block' || mode === 'unblock') {
      const first = booking.booking_segments[0];
      const where = {organization_id: organizationId, location_id: locationId, booking_id: booking.id,
        booking_segment_id: receipt.segmentIds[1], staff_profile_id: receipt.staffIds[2], starts_at: first.starts_at};
      if (mode === 'block') {
        expect(await prisma.booking_staff_allocations.count({where})).toBe(0);
        await prisma.booking_staff_allocations.create({data: {...where, ends_at: first.ends_at}});
      } else {
        expect(await prisma.booking_events.count({where: {booking_id: booking.id, event_type: 'STAFF_REASSIGNED'}})).toBe(0);
        expect(await prisma.booking_staff_allocations.deleteMany({where})).toEqual({count: 1});
      }
    } else if (mode === 'verify') {
      expect(booking.booking_segments.map(row => row.assigned_staff_id)).toEqual([receipt.staffIds[0], receipt.staffIds[0]]);
      expect(booking.total_minor).toBe(200000);
      const active = booking.booking_staff_allocations.filter(row => row.is_blocking);
      for (const segmentId of receipt.segmentIds) {
        expect(active.filter(row => row.booking_segment_id === segmentId).map(row => row.staff_profile_id).sort())
          .toEqual([receipt.staffIds[0], receipt.staffIds[2]].sort());
      }
      const events = booking.booking_events.filter(row => row.event_type === 'STAFF_REASSIGNED');
      expect(events).toHaveLength(2);
      writeFileSync('.dev-logs/physical-phone-readback.json', JSON.stringify({verified: true,
        bookingId: booking.id, primaryPreserved: true, amountsPreserved: true, reassignments: events.length}, null, 2));
    } else {
      expect(mode).toBe('cleanup');
      await prisma.$transaction(async tx => {
        await tx.bookings.update({where: {id: booking.id}, data: {status: 'CANCELLED', cancelled_at: new Date()}});
        await tx.booking_staff_allocations.updateMany({where: {booking_id: booking.id}, data: {is_blocking: false}});
        await tx.staff_profiles.updateMany({where: {id: {in: receipt.staffIds}, organization_id: organizationId}, data: {is_active: false}});
        await tx.customers.updateMany({where: {id: receipt.customerId, organization_id: organizationId}, data: {is_active: false}});
      });
    }
    return;
  }
  if (existsSync(file)) {
    const previous = receiptSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    expect(await prisma.bookings.count({where: {id: previous.bookingId, status: 'CONFIRMED'}}),
      'Finish or clean up the previous physical test before preparing another').toBe(0);
  }
  const receipt = await prisma.$transaction(async tx => {
    const services = await tx.location_services.findMany({where: {organization_id: organizationId,
      location_id: locationId, is_active: true}, take: 2});
    expect(services).toHaveLength(2);
    const customer = await tx.customers.create({data: {organization_id: organizationId, display_name: '手機注音測試顧客'}});
    const start = new Date(Date.now() + 4 * 86400000); start.setUTCHours(3, 0, 0, 0);
    const staffIds: string[] = [];
    for (const name of ['手機測試主美容師', '手機測試待改派', '手機測試替補美容師']) {
      const staff = await tx.staff_profiles.create({data: {organization_id: organizationId, display_name: name, public_visible: false}});
      staffIds.push(staff.id);
      await tx.staff_location_assignments.create({data: {organization_id: organizationId, location_id: locationId, staff_profile_id: staff.id}});
      await tx.staff_availability_rules.createMany({data: Array.from({length: 7}, (_, day) => ({organization_id: organizationId,
        location_id: locationId, staff_profile_id: staff.id, day_of_week: day,
        starts_at: new Date('1970-01-01T00:00:00Z'), ends_at: new Date('1970-01-01T23:59:00Z')}))});
      for (const service of services) {
        const assignment = await tx.service_staff_assignments.create({data: {organization_id: organizationId,
          location_service_id: service.id, staff_profile_id: staff.id,
          ...(staffIds.length === 2 ? {effective_until: start} : {})}});
        if (staffIds.length === 2) await tx.$executeRaw`insert into public.staff_capability_events
          (organization_id, location_id, assignment_id, actor_profile_id,
           effective_from, effective_until, online_booking_enabled, walk_in_eligible, reason)
          values (${organizationId}::uuid, ${locationId}::uuid, ${assignment.id}::uuid,
          '33333333-3333-4333-8333-333333333301'::uuid,
          '2020-01-01'::timestamptz, ${start}, true, true, 'Synthetic phone QA')`;
      }
    }
    const booking = await tx.bookings.create({data: {organization_id: organizationId, location_id: locationId,
      customer_id: customer.id, status: 'CONFIRMED', subtotal_minor: 200000, total_minor: 200000,
      tracking_token_hash: randomUUID(), is_test: true}});
    const segmentIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const startsAt = new Date(start.getTime() + i * 7200000), endsAt = new Date(start.getTime() + i * 7200000 + 3600000);
      const segment = await tx.booking_segments.create({data: {organization_id: organizationId, location_id: locationId,
        booking_id: booking.id, service_variant_id: services[i].service_variant_id, assigned_staff_id: staffIds[0],
        staff_name_snapshot: '手機測試主美容師', service_name_snapshot: `手機多項目測試 ${i + 1}`,
        variant_name_snapshot: '手機測試', starts_at: startsAt, ends_at: endsAt, duration_minutes: 60,
        price_minor: 100000, sort_order: i}});
      segmentIds.push(segment.id);
      await tx.booking_staff_allocations.createMany({data: staffIds.slice(0, 2).map(staffId => ({
        organization_id: organizationId, location_id: locationId, booking_id: booking.id,
        booking_segment_id: segment.id, staff_profile_id: staffId, starts_at: startsAt, ends_at: endsAt}))});
    }
    return {bookingId: booking.id, customerId: customer.id, staffIds, segmentIds};
  });
  mkdirSync('.dev-logs', {recursive: true});
  writeFileSync(file, JSON.stringify(receipt, null, 2));
}, 30000);
