import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({token: vi.fn(), context: vi.fn(), booking: vi.fn(), update: vi.fn()}));
vi.mock('@/server/database/prisma', () => ({prisma: {
  bookings: {findUnique: mocks.booking}, customers: {updateMany: mocks.update},
}}));
vi.mock('@/server/mobile/context', () => ({mobileSessionToken: mocks.token, requireMobileBookingContext: mocks.context}));
import {saveNotificationLanguage} from './language';

describe('recipient notification language authority', () => {
  const request = new Request('http://localhost:3100/api/preferences/language');
  beforeEach(() => {vi.resetAllMocks(); mocks.update.mockResolvedValue({count: 1});});
  it('does not infer a customer from a merchant or anonymous display preference', async () => {
    await saveNotificationLanguage(request, 'vi', {});
    await saveNotificationLanguage(request, 'vi', {store: 'demo'});
    mocks.token.mockReturnValue('verified-by-context');
    mocks.context.mockResolvedValue({actor: {kind: 'employee'}, context: {organizationId: 'org'}});
    await saveNotificationLanguage(request, 'en', {store: 'demo'});
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('persists only the verified mobile customer within the verified tenant', async () => {
    mocks.token.mockReturnValue('verified-by-context');
    mocks.context.mockResolvedValue({actor: {kind: 'customer', customerId: 'customer'}, context: {organizationId: 'org'}});
    await saveNotificationLanguage(request, 'vi', {store: 'demo'});
    expect(mocks.context).toHaveBeenCalledWith(request, 'demo');
    expect(mocks.update).toHaveBeenCalledWith({where: {id: 'customer', organization_id: 'org',
      is_active: true, anonymized_at: null}, data: {preferred_language: 'vi'}});
  });
  it.each(['expired', 'revoked', 'cross-tenant', 'cross-branch'])('fails closed on %s mobile proof', async reason => {
    mocks.token.mockReturnValue('invalid'); mocks.context.mockRejectedValue(new Error(reason));
    await expect(saveNotificationLanguage(request, 'en', {store: 'other'})).rejects.toThrow(reason);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('resolves a tracking capability to its tenant and never accepts a customer selector', async () => {
    mocks.booking.mockResolvedValue({organization_id: 'org', customer_id: 'customer'});
    await saveNotificationLanguage(request, 'en', {trackingToken: 'synthetic-capability'});
    expect(mocks.booking.mock.calls[0][0].where.tracking_token_hash).not.toBe('synthetic-capability');
    expect(mocks.update.mock.calls[0][0].where).toMatchObject({organization_id: 'org', id: 'customer'});
    mocks.booking.mockResolvedValue(null);
    await expect(saveNotificationLanguage(request, 'vi', {trackingToken: 'invalid'})).rejects.toMatchObject({status: 404});
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it('does not report a save for inactive or anonymized customers', async () => {
    mocks.booking.mockResolvedValue({organization_id: 'org', customer_id: 'customer'});
    mocks.update.mockResolvedValue({count: 0});
    await expect(saveNotificationLanguage(request, 'en', {trackingToken: 'synthetic'})).rejects.toMatchObject({status: 404});
  });
});
