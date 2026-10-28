import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { assertCapability, requireLocation } from "@/server/authorization/context";
import { prisma } from "@/server/database/prisma";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { AppError } from "@/server/http/errors";
import { applySyntheticPromotion } from "@/server/members/checkout";
import { quotePromotion } from "@/server/members/policy";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const schema = z.object({ bookingId: z.uuid(), mode: z.enum(["PREVIEW", "APPLY"]),
  expectedVersion: z.number().int().positive().optional(),
  relationshipAttested: z.boolean().optional() }).strict();

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const session = await requireRequestSession(request);
    assertSessionCsrf(request, session);
    const scope = merchantScopeSchema.parse({
      organization: request.nextUrl.searchParams.get("organization"),
      location: request.nextUrl.searchParams.get("location"),
    });
    const context = await resolveMerchantContext({ session,
      organizationSlug: scope.organization, locationSlug: scope.location });
    assertCapability(context, "payment.manage");
    const location = requireLocation(context);
    const input = schema.parse(await request.json());
    if (input.mode === "APPLY") {
      if (!input.expectedVersion) throw new AppError("BAD_REQUEST", "請提供預約版本後再套用優惠。", 400);
      return jsonSuccess(await applySyntheticPromotion({ context,
        bookingId: input.bookingId, expectedVersion: input.expectedVersion,
        relationshipAttested: input.relationshipAttested, requestId }));
    }
    const booking = await prisma.bookings.findFirst({ where: {
      id: input.bookingId, organization_id: context.organization.id,
      location_id: location.id,
    }, select: { customer_id: true, currency: true,
      booking_segments: { select: { service_variant_id: true, price_minor: true } } } });
    if (!booking || booking.booking_segments.some(segment => !segment.service_variant_id)) {
      throw new AppError("NOT_FOUND", "Booking not found", 404);
    }
    const quote = await quotePromotion({ organizationId: context.organization.id,
      locationId: location.id, customerId: booking.customer_id,
      timezone: location.timezone, currency: booking.currency,
      segments: booking.booking_segments.map(segment => ({
        serviceVariantId: segment.service_variant_id!,
        listPriceMinor: segment.price_minor })), at: new Date(),
      relationshipAttested: input.relationshipAttested });
    return jsonSuccess(quote);
  } catch (error) { return jsonError(error, requestId, request); }
}
