import "server-only";

import type { VerifiedMobileActor } from "../auth/line-mobile-session";
import { assignUnspecifiedBooking, failDispatchClaim, type DispatchMode } from "../booking/dispatch";
import { requireConfiguredWalkInStart } from "../booking/walkin-policy";
import { AppError } from "../http/errors";
import { confirmPublicBooking } from "../public-booking/booking";
import type { PublicSessionContext } from "../public-booking/context";
import { createBookingHold } from "../public-booking/hold";
import { bookingSourceForMobileActor } from "./booking-policy";

export async function bookMobile(input: {
  actor: VerifiedMobileActor;
  context: PublicSessionContext;
  serviceVariantId: string;
  staffProfileId?: string;
  dispatchMode?: DispatchMode;
  startsAt: string;
  name: string;
  phone: string;
  source: "line" | "phone" | "personal-line";
  idempotencyKey: string;
  holdOnly?: boolean;
}): Promise<{ id: string; status: string; start: string; trackingToken?: string }> {
  const source = bookingSourceForMobileActor(input.actor, input.source);
  if (input.dispatchMode === "immediate" && input.actor.kind !== "employee") {
    throw new AppError("FORBIDDEN", "Immediate dispatch requires employee access", 403);
  }
  const selectedStaffWalkIn = input.dispatchMode === "immediate" && input.staffProfileId ?
    await requireConfiguredWalkInStart(input.context.organizationId,
      input.context.locationId,new Date(input.startsAt)) : null;
  if (!input.staffProfileId && input.holdOnly) throw new Error("Unspecified holds are unsupported");
  const dispatch = input.staffProfileId ? null : await assignUnspecifiedBooking(
    input.context, input.serviceVariantId, { startsAt: input.startsAt },
    input.dispatchMode ?? "future", input.idempotencyKey);
  try {
    const hold = await createBookingHold({
      context: input.context, serviceVariantId: input.serviceVariantId,
      staffProfileId: input.staffProfileId ?? dispatch!.staffProfileId,
      startsAt: input.startsAt, idempotencyKey: input.idempotencyKey,
      bypassOnlineLead: selectedStaffWalkIn?.bypassOnlineLead ?? dispatch?.bypassOnlineLead,
    });
    if (input.holdOnly) return { id: hold.holdToken, status: "hold", start: hold.selection.startsAt };
    const confirmed = await confirmPublicBooking({
      context: input.context, idempotencyKey: input.idempotencyKey,
      keepSessionActive: true, dispatchClaimId: dispatch?.claimId,
      source, linkedCustomerId: input.actor.kind === "customer" ? input.actor.customerId ?? undefined : undefined,
      payload: { holdToken: hold.holdToken,
        customer: { displayName: input.name, phone: input.phone },
        consents: { service: true, marketing: false } },
    });
    return { id: confirmed.booking.id, status: confirmed.booking.status,
      start: confirmed.booking.service.startsAt, trackingToken: confirmed.trackingToken };
  } catch (error) {
    if (dispatch) await failDispatchClaim(dispatch.claimId,
      input.context.organizationId, input.context.locationId);
    throw error;
  }
}
