import { publicMessage } from '@/lib/line-booking/validation';
import { translateError } from '@/lib/i18n/messages';
import { requestLocale } from '@/lib/i18n/request';
import { z } from "zod";

import { linkExistingCustomerByBooking } from "@/server/auth/line-linking";
import { AppError } from "@/server/http/errors";
import { requireMobileBookingContext } from "@/server/mobile/context";
import { consumeRateLimit } from "@/server/security/rate-limit";

const bodySchema = z.object({
  store: z.string().min(1).max(100),
  trackingToken: z.string().min(32).max(512),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());
    const { actor, context } = await requireMobileBookingContext(request, body.store);
    if (actor.kind !== "customer" || !actor.customerId) {
      throw new AppError("FORBIDDEN", "Customer LINE session required", 403);
    }
    await consumeRateLimit({ scope: `line-customer-link:${context.locationId}`,
      identifier: actor.sessionId, limit: 5, windowMs: 60 * 60_000 });
    const customerId = await linkExistingCustomerByBooking({
      organizationId: context.organizationId, locationId: context.locationId,
      mobileSessionId: actor.sessionId, currentCustomerId: actor.customerId,
      trackingToken: body.trackingToken,
    });
    return Response.json({ linked: true, customerId });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: publicMessage(error, request) }, { status: error.status });
    return Response.json({ error: translateError(requestLocale(request), "連結資料無效，請確認預約憑證。") }, { status: 400 });
  }
}
