import { Body, Controller, Get, Inject, Param, Patch, Query } from "@nestjs/common";
import { ok } from "@beauty-saas/shared";
import { appointmentStatusSchema, updateAppointmentStatusSchema, updateBookingSlotSchema } from "@beauty-saas/validation";
import { PublicBookingService } from "./public-booking.service.js";

@Controller("shop/tenants/:tenantSlug")
export class ShopAppointmentsController {
  constructor(@Inject(PublicBookingService) private readonly booking: PublicBookingService) {}

  @Get("appointments")
  appointments(
    @Param("tenantSlug") tenantSlug: string,
    @Query("branchId") branchId?: string,
    @Query("staffId") staffId?: string,
    @Query("status") status?: string,
    @Query("date") date?: string
  ) {
    return ok(
      this.booking.listBookings(tenantSlug, {
        ...(branchId ? { branchId } : {}),
        ...(staffId ? { staffId } : {}),
        ...(status ? { status: appointmentStatusSchema.parse(status) } : {}),
        ...(date ? { date } : {})
      })
    );
  }

  @Get("calendar")
  calendar(
    @Param("tenantSlug") tenantSlug: string,
    @Query("audience") audience = "merchant",
    @Query("branchId") branchId?: string,
    @Query("staffId") staffId?: string
  ) {
    const calendarAudience = audience === "customer" ? "customer" : "merchant";
    return ok(this.booking.listCalendar(tenantSlug, calendarAudience, branchId, staffId));
  }

  @Patch("calendar/slot")
  updateSlot(@Param("tenantSlug") tenantSlug: string, @Body() body: unknown) {
    const input = updateBookingSlotSchema.parse(body);
    return ok(this.booking.updateBookingSlot(tenantSlug, input));
  }

  @Get("notifications")
  notifications(@Param("tenantSlug") tenantSlug: string) {
    return ok(this.booking.listNotifications(tenantSlug));
  }

  @Patch("appointments/:appointmentId/status")
  updateStatus(@Param("tenantSlug") tenantSlug: string, @Param("appointmentId") appointmentId: string, @Body() body: unknown) {
    const input = updateAppointmentStatusSchema.parse(body);
    return ok(this.booking.updateBookingStatus(tenantSlug, appointmentId, input));
  }
}
