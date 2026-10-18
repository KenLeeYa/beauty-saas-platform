import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "limits operations review and benefit changes to approved merchant roles",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { createApplicationSession },
      { GET: getOperations, POST: postOperations },
      { GET: getBenefits, POST: postBenefits },
      { GET: getWalkin, PATCH: patchWalkin },
      { POST: previewAllocation }, { randomToken }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/auth/session"),
      import("../src/app/api/merchant/operations/route"),
      import("../src/app/api/merchant/benefits/route"),
      import("../src/app/api/merchant/operations/walkin/route"),
      import("../src/app/api/merchant/operations/commission-allocation/route"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const organization = await prisma.organizations.findUniqueOrThrow({ where: {
      id: organizationId }, select: { slug: true } });
    const location = await prisma.locations.findUniqueOrThrow({ where: {
      id: locationId }, select: { slug: true } });
    const query = new URLSearchParams({ organization: organization.slug,
      location: location.slug }).toString();
    const front = await prisma.profiles.create({ data: {
      email: `front-${randomToken(8).replace(/[^a-zA-Z0-9]/g,"a")}@example.test`,
      display_name: "Front desk synthetic",
    }, select: { id: true } });
    await prisma.location_memberships.create({ data: {
      organization_id: organizationId, location_id: locationId,
      profile_id: front.id, role: "FRONT_DESK", status: "ACTIVE",
    } });
    const owner = await createApplicationSession({
      profileId: "33333333-3333-4333-8333-333333333301" });
    const receptionist = await createApplicationSession({ profileId: front.id });
    const request = (path: string, material: typeof owner, body?: object) =>
      new NextRequest(`http://127.0.0.1:3100${path}?${query}`, {
        method: body ? "POST" : "GET",
        headers: { origin: "http://127.0.0.1:3100",
          cookie: `beauty_session=${material.sessionToken}; beauty_csrf=${material.csrfToken}`,
          "x-csrf-token": material.csrfToken, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    expect((await getOperations(request("/api/merchant/operations",owner))).status).toBe(200);
    expect((await getOperations(request("/api/merchant/operations",receptionist))).status).toBe(403);
    expect((await getBenefits(request("/api/merchant/benefits",receptionist))).status).toBe(403);
    expect((await getWalkin(request("/api/merchant/operations/walkin",owner))).status).toBe(200);
    expect((await getWalkin(request("/api/merchant/operations/walkin",receptionist))).status).toBe(403);
    const policyBody = { earliestStartMinutes: 15, setupBufferMinutes: 10,
      onlineMinimumAdvanceApplies: false };
    expect((await patchWalkin(new NextRequest(
      `http://127.0.0.1:3100/api/merchant/operations/walkin?${query}`, {
        method: "PATCH", headers: { origin: "http://127.0.0.1:3100",
          cookie: `beauty_session=${receptionist.sessionToken}; beauty_csrf=${receptionist.csrfToken}`,
          "x-csrf-token": receptionist.csrfToken, "content-type": "application/json" },
        body: JSON.stringify(policyBody),
      }))).status).toBe(403);
    expect((await previewAllocation(request(
      "/api/merchant/operations/commission-allocation",receptionist,{
        bookingSegmentId: "00000000-0000-4000-8000-000000000001",
        method: "PERCENT", lines: [
          { staffProfileId: "00000000-0000-4000-8000-000000000002", shareBps: 6000 },
          { staffProfileId: "00000000-0000-4000-8000-000000000003", shareBps: 4000 },
        ],
      }))).status).toBe(503);
    expect((await postOperations(request("/api/merchant/operations",receptionist,{
      action: "CALCULATE_PAYROLL", employeeId: front.id,
      from: "2026-10-01", until: "2026-11-01",
      ruleId: "00000000-0000-4000-8000-000000000001",
    }))).status).toBe(503);
    expect((await postBenefits(request("/api/merchant/benefits",receptionist,{
      action: "ISSUE", customerId: "00000000-0000-4000-8000-000000000001",
      kind: "COUPON", quantity: 1, discountMinor: 100,
      idempotencyKey: randomToken(24),
    }))).status).toBe(403);
    process.env.MEMBER_VALUE_TEST_ONLY = "true";
    try {
      const draftResponse = await postBenefits(request("/api/merchant/benefits",owner,{
        action: "CREATE_PROMOTION", policyKey: `DRAFT_${randomToken(8)
          .replace(/[^A-Za-z0-9]/g,"A").toUpperCase()}`, version: 1,
        kind: "SEASONAL", priority: 999999, discountPercent: 10,
        maxDiscountMinor: null, serviceVariantId: null,
        effectiveFrom: "2026-11-01T00:00:00Z",
        effectiveUntil: "2026-11-02T00:00:00Z",
        attestationRequired: false,
      }));
      expect(draftResponse.status).toBe(200);
      const draft = await draftResponse.json() as { data: { policyId: string } };
      expect(draft.data.policyId).toBeTruthy();
      await prisma.$executeRaw(Prisma.sql`
        delete from public.member_promotion_policies
        where id=${draft.data.policyId}::uuid
      `);
    } finally { delete process.env.MEMBER_VALUE_TEST_ONLY; }
  }, 60_000);
