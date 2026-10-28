import 'server-only';

import type {Locale} from '@/lib/i18n/locale';
import {prisma} from '@/server/database/prisma';
import {AppError} from '@/server/http/errors';
import {mobileSessionToken, requireMobileBookingContext} from '@/server/mobile/context';
import {sha256} from '@/server/security/crypto';

export async function saveNotificationLanguage(request: Request, locale: Locale,
  target: {store?: string; trackingToken?: string}): Promise<void> {
  let customer: {organizationId: string; customerId: string} | undefined;
  if (target.store && mobileSessionToken(request)) {
    const {actor, context} = await requireMobileBookingContext(request, target.store);
    if (actor.kind === 'customer' && actor.customerId) {
      customer = {organizationId: context.organizationId, customerId: actor.customerId};
    }
  } else if (target.trackingToken) {
    const booking = await prisma.bookings.findUnique({where: {tracking_token_hash: sha256(target.trackingToken)},
      select: {organization_id: true, customer_id: true}});
    if (!booking) throw new AppError('NOT_FOUND', '找不到預約資料。', 404);
    customer = {organizationId: booking.organization_id, customerId: booking.customer_id};
  }
  // An employee's display preference must never change a customer's notification language.
  if (customer) {
    const changed = await prisma.customers.updateMany({where: {id: customer.customerId,
      organization_id: customer.organizationId, is_active: true, anonymized_at: null},
    data: {preferred_language: locale}});
    if (!changed.count) throw new AppError('NOT_FOUND', '找不到顧客。', 404);
  }
}
