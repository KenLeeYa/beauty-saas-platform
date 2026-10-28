import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/database/prisma";
import { AppError } from "@/server/http/errors";
import { mobileJsonError } from "@/server/http/response";
import { requireMobileBookingContext } from "@/server/mobile/context";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { recordClockEvent } from "@/server/staff/attendance";

const commandSchema = z.object({ store: z.string().min(1).max(100),
  kind: z.enum(["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"]),
  idempotencyKey: z.uuid() }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const store = z.string().min(1).max(100).parse(new URL(request.url).searchParams.get("store"));
    const { actor, context } = await requireMobileBookingContext(request, store);
    if (actor.kind !== "employee" || !actor.profileId ||
        !actor.capabilities.has("schedule.own.manage")) {
      throw new AppError("FORBIDDEN", "Employee attendance required", 403);
    }
    const rows = await prisma.$queryRaw<{ id: string; kind: string;
      occurredAt: Date }[]>(Prisma.sql`
      select event.id, event.kind,
        coalesce(correction.corrected_at,event.occurred_at) as "occurredAt"
      from public.staff_attendance_events event
      left join public.staff_attendance_corrections correction on correction.event_id=event.id
      where event.organization_id=${context.organizationId}::uuid
        and event.profile_id=${actor.profileId}::uuid
      order by coalesce(correction.corrected_at,event.occurred_at) desc limit 50
    `);
    return Response.json({ events: rows.map(row => ({ id: row.id, kind: row.kind,
      occurredAt: row.occurredAt.toISOString() })) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileJsonError(error, request);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const command = commandSchema.parse(await request.json());
    const { actor, context } = await requireMobileBookingContext(request, command.store);
    await consumeRateLimit({ scope: `attendance:${context.locationId}`,
      identifier: actor.sessionId, limit: 20, windowMs: 60 * 60_000 });
    const id = await recordClockEvent(actor, context.locationId, command.kind,
      new Date(), command.idempotencyKey);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return mobileJsonError(error, request);
  }
}
