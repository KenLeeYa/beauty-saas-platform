import { Module } from "@nestjs/common";
import { PublicBookingController } from "./public-booking.controller.js";
import { PublicBookingService } from "./public-booking.service.js";
import { ShopAppointmentsController } from "./shop-appointments.controller.js";

@Module({
  controllers: [PublicBookingController, ShopAppointmentsController],
  providers: [PublicBookingService]
})
export class PublicBookingModule {}
