import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "enforces dated staff eligibility and manager-only changes",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { isStaffQualified, setStaffCapability },
      { getPublicAvailability }, { resolvePublicLocation },
      { addLocalDays, formatDateInTimeZone }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/staff/service-capability"),
      import("../src/server/public-booking/availability"),
      import("../src/server/public-booking/context"),
      import("../src/server/time/timezone"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const variantId = "66666666-6666-4666-8666-666666666611";
    const staffId = "44444444-4444-4444-8444-444444444401";
    const ownerId = "33333333-3333-4333-8333-333333333301";
    const assignment = await prisma.service_staff_assignments.findFirstOrThrow({
      where: { organization_id: organizationId, staff_profile_id: staffId,
        location_services: { location_id: locationId, service_variant_id: variantId } },
      select: { id: true },
    });
    const organization = await prisma.organizations.findUniqueOrThrow({
      where: { id: organizationId }, select: { slug: true, name: true, status: true },
    });
    const location = await prisma.locations.findUniqueOrThrow({ where: { id: locationId },
      select: { slug: true, name: true, timezone: true } });
    const context: OrganizationContext = {
      session: { id: "synthetic-session", profileId: ownerId, email: "owner@example.test",
        displayName: "Owner", platformRole: null, expiresAt: new Date(Date.now() + 60_000),
        csrfTokenHash: "" },
      organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationId]), linkedStaffProfileId: null,
    };
    const now = new Date();
    const future = new Date(now.getTime() + 2 * 86400_000);
    const later = new Date(now.getTime() + 3 * 86400_000);
    const original = await prisma.service_staff_assignments.findUniqueOrThrow({
      where: { id: assignment.id }, select: { effective_from: true, effective_until: true,
        online_booking_enabled: true, walk_in_eligible: true },
    });
    try {
      await expect(setStaffCapability({ context: { ...context,
        roles: new Set(["SERVICE_PROVIDER"]) }, assignmentId: assignment.id,
        effectiveFrom: future, effectiveUntil: null, onlineSelectable: true,
        walkInEligible: false, reason: "synthetic" })).rejects.toMatchObject({ status: 403 });
      await setStaffCapability({ context: { ...context, roles: new Set(["FRONT_DESK"]) },
        assignmentId: assignment.id,
        effectiveFrom: future, effectiveUntil: null, onlineSelectable: true,
        walkInEligible: false, reason: "synthetic future qualification" });
      expect(await isStaffQualified(locationId, staffId, variantId, now, "ONLINE")).toBe(false);
      expect(await isStaffQualified(locationId, staffId, variantId, later, "ONLINE")).toBe(true);
      expect(await isStaffQualified(locationId, staffId, variantId, later, "WALK_IN")).toBe(false);
      const store = await resolvePublicLocation({ organizationSlug: organization.slug,
        locationSlug: location.slug });
      const tomorrow = addLocalDays(formatDateInTimeZone(now, location.timezone), 1);
      const availability = await getPublicAvailability({ ...store,
        sessionId: "00000000-0000-4000-8000-000000000000", sessionToken: "synthetic",
        requestId: "synthetic" }, { serviceVariantId: variantId,
        staffProfileId: staffId, date: tomorrow });
      expect(availability.staff).toHaveLength(0);
      expect((await prisma.$queryRaw<{ id: string }[]>`select id from public.staff_capability_events where assignment_id = ${assignment.id}::uuid`).length)
        .toBeGreaterThan(0);
    } finally {
      await prisma.service_staff_assignments.update({ where: { id: assignment.id }, data: original });
    }
  }, 60_000,
);
