import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";

import type { VerifiedMobileActor } from "../src/server/auth/line-mobile-session";
import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "records immutable overnight, cross-location clocks, break and approved correction",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { recordClockEvent, approveClockCorrection,
      listAttendanceAcrossOrganization, summarizeAttendance },
      { capabilitiesForRoles }, { randomToken }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/staff/attendance"),
      import("../src/server/authorization/capabilities"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationA = "22222222-2222-4222-8222-222222222221";
    const slug = `clock-${randomToken(7).toLowerCase().replace(/[^a-z0-9]/g,"a")}`;
    const other = await prisma.locations.create({ data: { organization_id: organizationId,
      name: "Synthetic clock branch", slug, code: slug,
      timezone: "Asia/Taipei", currency: "TWD" }, select: { id: true } });
    const profile = await prisma.profiles.create({ data: {
      email: `${slug}@example.test`, display_name: "Clock synthetic",
    }, select: { id: true } });
    await prisma.location_memberships.createMany({ data: [locationA, other.id].map(locationId => ({
      organization_id: organizationId, location_id: locationId, profile_id: profile.id,
      role: "SERVICE_PROVIDER" as const, status: "ACTIVE" as const,
    })) });
    const actor = (sessionId: string, locationId: string): VerifiedMobileActor => ({
      kind: "employee", sessionId, organizationId, locationId, profileId: profile.id,
      customerId: null, capabilities: capabilitiesForRoles(["SERVICE_PROVIDER"]),
    });
    const start = new Date("2026-10-04T15:00:00Z");
    const key = randomToken(24);
    const first = await recordClockEvent(actor("device-a",locationA),locationA,
      "CLOCK_IN",start,key,start);
    expect(await recordClockEvent(actor("device-b",locationA),locationA,
      "CLOCK_IN",start,key,start)).toBe(first);
    await expect(recordClockEvent(actor("device-b",locationA),locationA,
      "CLOCK_IN",start,randomToken(24),start)).rejects.toMatchObject({ status: 409 });
    await recordClockEvent(actor("device-a",locationA),locationA,"BREAK_START",
      new Date("2026-10-04T16:00:00Z"),randomToken(24),new Date("2026-10-04T16:00:00Z"));
    await recordClockEvent(actor("device-b",locationA),locationA,"BREAK_END",
      new Date("2026-10-04T16:30:00Z"),randomToken(24),new Date("2026-10-04T16:30:00Z"));
    const endId = await recordClockEvent(actor("device-b",other.id),other.id,"CLOCK_OUT",
      new Date("2026-10-05T01:30:00Z"),randomToken(24),new Date("2026-10-05T01:30:00Z"));
    const organization = await prisma.organizations.findUniqueOrThrow({ where: {
      id: organizationId }, select: { slug: true, name: true, status: true } });
    const branch = await prisma.locations.findUniqueOrThrow({ where: { id: other.id },
      select: { slug: true, name: true, timezone: true } });
    const manager: OrganizationContext = { session: { id: randomToken(16),
      profileId: "33333333-3333-4333-8333-333333333301", email: "owner@example.test",
      displayName: "Owner", platformRole: null, expiresAt: new Date(Date.now()+60_000),
      csrfTokenHash: "" }, organization: { id: organizationId, ...organization },
      location: { id: other.id, ...branch }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationA,other.id]),
      linkedStaffProfileId: null };
    const from = new Date("2026-10-04T00:00:00Z"), until = new Date("2026-10-06T00:00:00Z");
    const timeline = await listAttendanceAcrossOrganization(manager,profile.id,from,until);
    expect(timeline.map(event => event.locationId)).toEqual([
      locationA,locationA,locationA,other.id]);
    expect(summarizeAttendance(timeline,"Asia/Taipei")).toMatchObject({
      workedMinutes: 600, breakMinutes: 30, overtimeUnapprovedMinutes: 120,
      overnight: true, incomplete: false });
    await expect(listAttendanceAcrossOrganization({ ...manager,
      roles: new Set(["SERVICE_PROVIDER"]), accessibleLocationIds: new Set([locationA]) },
      profile.id,from,until)).rejects.toMatchObject({ status: 403 });
    await approveClockCorrection(manager,endId,new Date("2026-10-05T01:00:00Z"),
      "synthetic approved correction",randomToken(12));
    await expect(approveClockCorrection(manager,endId,new Date("2026-10-05T00:45:00Z"),
      "duplicate",randomToken(12))).rejects.toMatchObject({ status: 409 });
    const corrected = await listAttendanceAcrossOrganization(manager,profile.id,from,until);
    expect(summarizeAttendance(corrected,"Asia/Taipei")).toMatchObject({
      workedMinutes: 570, overtimeUnapprovedMinutes: 90, overnight: true });
    await expect(prisma.$executeRaw(Prisma.sql`
      update public.staff_attendance_events set occurred_at = now()
      where id = ${first}::uuid
    `)).rejects.toBeTruthy();
  }, 60_000,
);
