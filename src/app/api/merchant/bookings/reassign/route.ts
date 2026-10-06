import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { listAtRiskFutureBookings, reassignFutureBooking } from "@/server/booking/reassignment";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const commandSchema = z.object({ bookingId: z.uuid(), targetStaffId: z.uuid(),
  reason: z.string().trim().min(1).max(500) }).strict();

async function contextFor(request: NextRequest) {
  const session = await requireRequestSession(request);
  const scope = merchantScopeSchema.parse({
    organization: request.nextUrl.searchParams.get("organization"),
    location: request.nextUrl.searchParams.get("location"),
  });
  return { session, context: await resolveMerchantContext({ session,
    organizationSlug: scope.organization, locationSlug: scope.location }) };
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { context } = await contextFor(request);
    const staffId = z.uuid().parse(request.nextUrl.searchParams.get("staffId"));
    return jsonSuccess({ bookings: await listAtRiskFutureBookings(context, staffId) },
      { headers: { "x-request-id": requestId } });
  } catch (error) { return jsonError(error, requestId); }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { session, context } = await contextFor(request);
    assertSessionCsrf(request, session);
    const command = commandSchema.parse(await request.json());
    await reassignFutureBooking({ context, ...command, requestId });
    return jsonSuccess({ updated: true }, { headers: { "x-request-id": requestId } });
  } catch (error) { return jsonError(error, requestId); }
}
