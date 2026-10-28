import {beforeEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({jobs: vi.fn(), send: vi.fn(), adapter: vi.fn(),
  update: vi.fn(), delivery: vi.fn(), alert: vi.fn(), transaction: vi.fn()}));
vi.mock('../database/prisma', () => ({prisma: {
  booking_segments: {findMany: vi.fn().mockResolvedValue([])},
  notification_outbox: {findMany: vi.fn().mockResolvedValue([])},
  notification_jobs: {findMany: mocks.jobs, updateMany: vi.fn().mockResolvedValue({count: 1}), update: mocks.update},
  notification_deliveries: {create: mocks.delivery}, operational_events: {create: vi.fn()},
  operational_alerts: {findFirst: mocks.alert}, $transaction: mocks.transaction,
}}));
vi.mock('./adapters', () => ({getNotificationAdapterForLocation: mocks.adapter}));
import {runNotificationCycle} from './dispatcher';
import {prisma} from '../database/prisma';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.mockResolvedValue({configured: true, send: mocks.send});
  mocks.alert.mockResolvedValue({id: 'synthetic-alert'});
  mocks.transaction.mockImplementation(async operation => typeof operation === 'function' ? operation(prisma) : Promise.all(operation));
});

it('uses each recipient language and rereads changed preferences on retry without a real provider', async () => {
  const job = (language: string, attempt = 0) => ({id: 'job', status: attempt ? 'FAILED' : 'PENDING',
    channel: 'EMAIL', attempt_count: attempt, max_attempts: 3, notification_outbox: {
      id: 'outbox', organization_id: 'org', location_id: 'branch', event_type: 'BOOKING_CONFIRMED',
      payload: {language: 'zh-TW'}, organizations: {name: 'Lumi', notification_integrations: [{channel: 'EMAIL', status: 'ACTIVE'}]},
      locations: {name: 'Salon', timezone: 'Asia/Taipei'}, customers: {display_name: 'QA', contact_preference: 'EMAIL',
        preferred_language: language, customer_contacts: [{contact_type: 'EMAIL', normalized_value: 'qa@example.test', is_primary: true}],
        customer_contact_links: []}, bookings: {booking_segments: [{service_name_snapshot: 'Facial', starts_at: new Date('2026-10-25T03:00:00Z')}]},
    }});
  mocks.jobs.mockResolvedValueOnce([job('en')]).mockResolvedValueOnce([job('vi', 1)]).mockResolvedValueOnce([job('zh-TW')]);
  mocks.send.mockRejectedValueOnce(new Error('SYNTHETIC_UNAVAILABLE')).mockResolvedValue({providerMessageId: 'synthetic'});
  expect((await runNotificationCycle({workerId: 'test'})).failed).toBe(1);
  expect(mocks.send.mock.calls[0][0].subject).toContain('Appointment confirmed');
  expect((await runNotificationCycle({workerId: 'test'})).sent).toBe(1);
  expect(mocks.send.mock.calls[1][0].subject).toContain('Lịch hẹn đã được xác nhận');
  expect((await runNotificationCycle({workerId: 'test'})).sent).toBe(1);
  expect(mocks.send.mock.calls[2][0].subject).toContain('預約已確認');
  expect(mocks.jobs.mock.calls[0][0].select.notification_outbox.include.customers.select.preferred_language).toBe(true);
  expect(mocks.adapter).toHaveBeenCalledWith('EMAIL', 'org', 'branch');
});
