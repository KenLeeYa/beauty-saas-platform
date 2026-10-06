import type { booking_source } from "@prisma/client";

import type { VerifiedMobileActor } from "../auth/line-mobile-session";

export function bookingSourceForMobileActor(
  actor: VerifiedMobileActor,
  requested: "line" | "phone" | "personal-line",
): booking_source {
  if (requested !== "line" && (actor.kind !== "employee" ||
      !actor.capabilities.has("booking.create"))) {
    throw new Error("forbidden");
  }
  return requested === "phone" ? "PHONE" : "LINE";
}
