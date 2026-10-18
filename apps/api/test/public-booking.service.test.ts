import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PublicBookingService } from "../src/modules/public-booking/public-booking.service.js";

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing booking fixture: ${label}`);
  }

  return value;
}

describe("public booking calendar synchronization", () => {
  it("shows merchant-closed slots as closed to customers", () => {
    const bookingService = new PublicBookingService();
    const options = bookingService.getBookingOptions("demo");
    const branch = required(options.branches[0], "branch");
    const staff = required(options.staff[0], "staff");
    const date = required(options.availableDates[0], "date");
    const time = required(date.slots[0], "slot");

    bookingService.updateBookingSlot("demo", {
      branchId: branch.id,
      staffId: staff.id,
      date: date.date,
      time,
      isOpen: false
    });

    const customerCalendar = bookingService.listCalendar("demo", "customer", branch.id, staff.id);
    const calendarSlot = customerCalendar.flatMap((day) => day.slots).find((slot) => slot.date === date.date && slot.time === time);

    expect(calendarSlot?.status).toBe("CLOSED");
    expect(() =>
      bookingService.createBooking("demo", {
        branchId: branch.id,
        serviceId: required(options.services[0], "service").id,
        staffId: staff.id,
        date: date.date,
        time,
        customerName: "Closed Slot",
        customerPhone: "0912345678",
        customerEmail: "",
        note: ""
      })
    ).toThrow(BadRequestException);
  });

  it("shares a completed customer booking with both calendars and the shop list", () => {
    const bookingService = new PublicBookingService();
    const options = bookingService.getBookingOptions("demo");
    const branch = required(options.branches[0], "branch");
    const service = required(options.services[0], "service");
    const staff = required(options.staff[0], "staff");
    const date = required(options.availableDates[0], "date");
    const time = required(date.slots[1], "second slot");

    const booking = bookingService.createBooking("demo", {
      branchId: branch.id,
      serviceId: service.id,
      staffId: staff.id,
      date: date.date,
      time,
      customerName: "Calendar Sync",
      customerPhone: "0912345678",
      customerEmail: "",
      note: "Created from the customer flow"
    });

    const customerSlot = bookingService
      .listCalendar("demo", "customer", branch.id, staff.id)
      .flatMap((day) => day.slots)
      .find((slot) => slot.date === date.date && slot.time === time);
    const merchantSlot = bookingService
      .listCalendar("demo", "merchant", branch.id, staff.id)
      .flatMap((day) => day.slots)
      .find((slot) => slot.date === date.date && slot.time === time);

    expect(customerSlot).toMatchObject({ status: "BOOKED" });
    expect(customerSlot?.customerName).toBeUndefined();
    expect(merchantSlot).toMatchObject({
      status: "BOOKED",
      appointmentId: booking.id,
      customerName: "Calendar Sync",
      serviceName: service.name,
      servicePrice: service.price
    });
    expect(bookingService.listBookings("demo", {})).toContainEqual(booking);
  });
});
