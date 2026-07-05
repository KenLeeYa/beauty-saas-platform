import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
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

  @Post("appointments")
  create(@Param("tenantSlug") tenantSlug: string, @Body() body: unknown) {
    const input = createPublicBookingSchema.parse(body);
    return ok(this.booking.createBooking(tenantSlug, input));
  }
}
