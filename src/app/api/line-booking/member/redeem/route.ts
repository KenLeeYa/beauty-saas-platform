import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/database/prisma";
import { AppError } from "@/server/http/errors";
import { redeemEntitlement } from "@/server/members/ledger";
import { requireMobileBookingContext } from "@/server/mobile/context";
import { consumeRateLimit } from "@/server/security/rate-limit";

const commandSchema = z.object({ store: z.string().min(1).max(100),
  reservationId: z.uuid(), qrToken: z.string().min(32).max(512),
  idempotencyKey: z.uuid() }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const command = commandSchema.parse(await request.json());
    const { actor, context } = await requireMobileBookingContext(request, command.store);
    if (actor.kind !== "employee" || !actor.capabilities.has("booking.create")) {
      throw new AppError("FORBIDDEN", "Front desk access required", 403);
    }
    await consumeRateLimit({ scope: `member-redeem:${context.locationId}`,
      identifier: actor.sessionId, limit: 30, windowMs: 60 * 60_000 });
    const rows = await prisma.$queryRaw<{ customerId: string }[]>(Prisma.sql`
      select account.customer_id as "customerId"
      from public.member_wallet_reservations reservation
      join public.member_wallet_accounts account on account.id = reservation.account_id
      join public.bookings booking on booking.id = reservation.booking_id
        and booking.organization_id = reservation.organization_id
      where reservation.id = ${command.reservationId}::uuid
        and reservation.organization_id = ${context.organizationId}::uuid
        and booking.location_id = ${context.locationId}::uuid
        and account.organization_id = ${context.organizationId}::uuid
    `);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Redemption not found", 404);
    return Response.json(await redeemEntitlement({ organizationId: context.organizationId,
      customerId: rows[0].customerId, reservationId: command.reservationId,
      qrToken: command.qrToken, idempotencyKey: command.idempotencyKey }));
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message },
      { status: error.status });
    return Response.json({ error: "Invalid redemption" }, { status: 400 });
  }
}
