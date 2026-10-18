import type { NextRequest } from "next/server";
import { z } from "zod";

import { assertSessionCsrf, requireRequestSession } from "@/server/auth/session";
import { previewProviderAllocation, publishProviderAllocation } from "@/server/payroll/segment-allocation";
import { jsonError, jsonSuccess } from "@/server/http/response";
import { AppError } from "@/server/http/errors";
import { resolveMerchantContext } from "@/server/merchant/context";
import { merchantScopeSchema } from "@/server/merchant/schemas";
import { getRequestId } from "@/server/security/request";

const schema = z.object({ bookingSegmentId: z.uuid(),
  method: z.enum(["PERCENT","FIXED"]),
  lines: z.array(z.object({ staffProfileId: z.uuid(),
    shareBps: z.number().int().min(0).max(10000).optional(),
    fixedMinor: z.number().int().nonnegative().optional() }).strict()).min(2),
  expectedVersion: z.number().int().nonnegative().optional(),
  expectedBookingVersion: z.number().int().positive().optional(),
}).strict();

async function inputFor(request: NextRequest) {
  const session = await requireRequestSession(request);
  assertSessionCsrf(request,session);
  const scope = merchantScopeSchema.parse({
    organization: request.nextUrl.searchParams.get("organization"),
    location: request.nextUrl.searchParams.get("location"),
  });
  const context = await resolveMerchantContext({ session,
    organizationSlug: scope.organization, locationSlug: scope.location });
  const { expectedBookingVersion, ...input } = schema.parse(await request.json());
  return { context, expectedBookingVersion, ...input, requestId: getRequestId(request) };
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const input = await inputFor(request);
    return jsonSuccess({ preview: await previewProviderAllocation(input) });
  } catch (error) { return jsonError(error,requestId); }
}

export async function PUT(request: NextRequest): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const input = await inputFor(request);
    const { expectedBookingVersion } = input;
    if (expectedBookingVersion === undefined) throw new AppError(
      "BAD_REQUEST","Booking version required",400);
    return jsonSuccess({ allocation: await publishProviderAllocation({
      ...input, expectedBookingVersion }) });
  } catch (error) { return jsonError(error,requestId); }
}
