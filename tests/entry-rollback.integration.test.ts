import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "can hide the new store entry while retaining authoritative bookings",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { resolveMobileStore }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/mobile/store"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const slug = "synthetic-beauty-line";
    await prisma.$executeRaw(Prisma.sql`
      insert into public.mobile_store_entries
        (organization_id, location_id, entry_slug, is_enabled)
      values (${organizationId}::uuid, ${locationId}::uuid, ${slug}, true)
      on conflict (organization_id, location_id)
      do update set entry_slug=excluded.entry_slug, is_enabled=true
    `);
    const before = await prisma.bookings.count({
      where: { organization_id: organizationId, location_id: locationId },
    });
    expect(before).toBeGreaterThan(0);
    try {
      await prisma.$executeRaw(Prisma.sql`
        update public.mobile_store_entries set is_enabled=false
        where organization_id=${organizationId}::uuid
          and location_id=${locationId}::uuid
      `);
      await expect(resolveMobileStore(slug)).rejects.toMatchObject({ status: 404 });
      expect(await prisma.bookings.count({
        where: { organization_id: organizationId, location_id: locationId },
      })).toBe(before);
    } finally {
      await prisma.$executeRaw(Prisma.sql`
        update public.mobile_store_entries set is_enabled=true
        where organization_id=${organizationId}::uuid
          and location_id=${locationId}::uuid
      `);
    }
    expect((await resolveMobileStore(slug)).locationId).toBe(locationId);
  },
);
