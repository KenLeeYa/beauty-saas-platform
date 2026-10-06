import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { selectStoreLineChannel, type StoreLineChannel } from "./line-channel-selection";

/** References only: credentials are held in server configuration, never this table. */
export async function resolveStoreLineChannel(
  organizationId: string,
  locationId: string,
  channelId: string,
): Promise<StoreLineChannel | null> {
  const rows = await prisma.$queryRaw<StoreLineChannel[]>(Prisma.sql`
    select organization_id as "organizationId",
           location_id as "locationId",
           channel_id as "channelId",
           provider_id as "providerId",
           is_enabled as enabled
      from public.store_line_channels
     where organization_id = ${organizationId}::uuid
       and location_id = ${locationId}::uuid
       and channel_id = ${channelId}
       and is_enabled
     limit 1
  `);
  return selectStoreLineChannel(rows, organizationId, locationId, channelId);
}

export async function getStoreLineLoginChannel(
  organizationId: string,
  locationId: string,
): Promise<StoreLineChannel | null> {
  const rows = await prisma.$queryRaw<StoreLineChannel[]>(Prisma.sql`
    select organization_id as "organizationId", location_id as "locationId",
      channel_id as "channelId", provider_id as "providerId",
      is_enabled as enabled
    from public.store_line_channels
    where organization_id = ${organizationId}::uuid
      and location_id = ${locationId}::uuid
      and purpose = 'LOGIN' and is_enabled
    limit 1
  `);
  return rows[0] ?? null;
}

export async function getStoreLineMessagingChannel(
  organizationId:string, locationId:string,
):Promise<StoreLineChannel|null> {
  const rows=await prisma.$queryRaw<StoreLineChannel[]>(Prisma.sql`
    select organization_id as "organizationId", location_id as "locationId",
      channel_id as "channelId", provider_id as "providerId",is_enabled as enabled
    from public.store_line_channels
    where organization_id=${organizationId}::uuid and location_id=${locationId}::uuid
      and purpose='MESSAGING' and is_enabled limit 1
  `);
  return rows[0]??null;
}
