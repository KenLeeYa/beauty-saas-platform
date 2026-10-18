import { expect, it } from "vitest";

import { bookingSourceForMobileActor } from "./booking-policy";
import type { VerifiedMobileActor } from "../auth/line-mobile-session";

const customer: VerifiedMobileActor = {
  kind: "customer", sessionId: "s", organizationId: "o", locationId: "l",
  profileId: null, customerId: "c", capabilities: new Set(),
};
const frontDesk: VerifiedMobileActor = {
  ...customer, kind: "employee", profileId: "p", customerId: null,
  capabilities: new Set(["booking.create"]),
};

it("allows manual phone and personal LINE sources only for booking staff", () => {
  expect(bookingSourceForMobileActor(customer, "line")).toBe("LINE");
  expect(() => bookingSourceForMobileActor(customer, "phone")).toThrow("forbidden");
  expect(bookingSourceForMobileActor(frontDesk, "phone")).toBe("PHONE");
  expect(bookingSourceForMobileActor(frontDesk, "personal-line")).toBe("LINE");
});
