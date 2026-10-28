import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import { resolvePublicLocation, type PublicLocationContext } from "../public-booking/context";

type StoreEntryRow = {
  organizationId: string;
  locationId: string;
  organizationSlug: string;
  locationSlug: string;
};

/** Resolve a globally unique entry key before any public booking or mobile auth query. */
export async function resolveMobileStore(entrySlug: string): Promise<PublicLocationContext> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entrySlug) || entrySlug.length > 80) {
    throw new AppError("NOT_FOUND", "Store not found", 404);
  }
  const rows = await prisma.$queryRaw<StoreEntryRow[]>(Prisma.sql`
    select entry.organization_id as "organizationId", entry.location_id as "locationId",
      org.slug as "organizationSlug", location.slug as "locationSlug"
    from public.mobile_store_entries entry
    join public.locations location on location.id = entry.location_id
      and location.organization_id = entry.organization_id
    join public.organizations org on org.id = entry.organization_id
    where entry.entry_slug = ${entrySlug} and entry.is_enabled
    limit 1
  `);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Store not found", 404);
  const context = await resolvePublicLocation({
    organizationSlug: row.organizationSlug,
    locationSlug: row.locationSlug,
  });
  if (context.organizationId !== row.organizationId || context.locationId !== row.locationId) {
    throw new AppError("NOT_FOUND", "Store not found", 404);
  }
  return context;
}
