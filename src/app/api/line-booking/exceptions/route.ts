import { z } from "zod";

import { acknowledgeDispatchException, listBookingExceptions } from "@/server/booking/exception-queue";
import { mobileJsonError } from "@/server/http/response";
import { requireMobileBookingContext } from "@/server/mobile/context";
import { assertSameOrigin, getRequestId } from "@/server/security/request";

const command = z.object({ store:z.string().min(1), claimId:z.uuid(),
  reason:z.string().trim().min(1).max(500) }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const store = z.string().min(1).parse(new URL(request.url).searchParams.get("store"));
    const { actor } = await requireMobileBookingContext(request,store);
    return Response.json({ items:await listBookingExceptions(actor) },
      { headers:{ "Cache-Control":"no-store" } });
  } catch (error) {
    return mobileJsonError(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = command.parse(await request.json());
    const { actor } = await requireMobileBookingContext(request,input.store);
    await acknowledgeDispatchException(actor,input.claimId,input.reason,getRequestId(request));
    return Response.json({ reviewed:true });
  } catch (error) {
    return mobileJsonError(error, request);
  }
}
