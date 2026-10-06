import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect,it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "scopes and audits receptionist dispatch exception review",async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma },{ capabilitiesForRoles },
      { listBookingExceptions,acknowledgeDispatchException },
      { randomToken,sha256 }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/authorization/capabilities"),
      import("../src/server/booking/exception-queue"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId="11111111-1111-4111-8111-111111111111";
    const locationId="22222222-2222-4222-8222-222222222221";
    const actor = { kind:"employee" as const,sessionId:randomToken(16),
      organizationId,locationId,
      profileId:"33333333-3333-4333-8333-333333333304",customerId:null,
      capabilities:capabilitiesForRoles(["FRONT_DESK"]) };
    const claim = await prisma.$queryRaw<{ id:string }[]>(Prisma.sql`
      insert into public.booking_dispatch_claims
        (organization_id,location_id,service_variant_id,staff_profile_id,
         idempotency_hash,mode,starts_at,status,expires_at)
      values (${organizationId}::uuid,${locationId}::uuid,
        '66666666-6666-4666-8666-666666666611'::uuid,
        '44444444-4444-4444-8444-444444444401'::uuid,
        ${sha256(randomToken(24))},'FUTURE',now()+interval '2 days',
        'FAILED',now()-interval '1 minute') returning id
    `);
    const id=claim[0].id;
    expect((await listBookingExceptions(actor)).some(item => item.id===id)).toBe(true);
    await expect(listBookingExceptions({ ...actor,
      capabilities:capabilitiesForRoles(["SERVICE_PROVIDER"]) }))
      .rejects.toMatchObject({ status:403 });
    await expect(listBookingExceptions({ ...actor,locationId:
      "22222222-2222-4222-8222-222222222222" }))
      .resolves.not.toContainEqual(expect.objectContaining({ id }));
    await acknowledgeDispatchException(actor,id,"called customer and rebooked",randomToken(12));
    await acknowledgeDispatchException(actor,id,"called customer and rebooked",randomToken(12));
    await expect(acknowledgeDispatchException(actor,id,"different result",randomToken(12)))
      .rejects.toMatchObject({ status:409 });
    expect((await listBookingExceptions(actor)).some(item => item.id===id)).toBe(false);
    const review = await prisma.$queryRaw<{ reason:string }[]>(Prisma.sql`
      select reason from public.booking_dispatch_exception_reviews where claim_id=${id}::uuid
    `);
    expect(review[0].reason).toBe("called customer and rebooked");
  },60_000);
