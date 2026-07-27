import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { ok } from "@beauty-saas/shared";
import { createPublicBookingSchema } from "@beauty-saas/validation";
import { PublicBookingService } from "./public-booking.service.js";

@Controller("public/tenants/:tenantSlug")
export class PublicBookingController {
  constructor(@Inject(PublicBookingService) private readonly booking: PublicBookingService) {}

  @Get("booking/options")
  options(@Param("tenantSlug") tenantSlug: string) {
    return ok(this.booking.getBookingOptions(tenantSlug));
  }

  @Get("booking/calendar")
  calendar(@Param("tenantSlug") tenantSlug: string, @Query("branchId") branchId?: string, @Query("staffId") staffId?: string) {
    return ok(this.booking.listCalendar(tenantSlug, "customer", branchId, staffId));
  }

  @Post("appointments")
  create(@Param("tenantSlug") tenantSlug: string, @Body() body: unknown) {
    const input = createPublicBookingSchema.parse(body);
    return ok(this.booking.createBooking(tenantSlug, input));
  }
}
