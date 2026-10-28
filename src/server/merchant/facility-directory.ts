import "server-only";
import {Prisma, type resource_kind} from "@prisma/client";
import {z} from "zod";
import {translate} from "@/lib/i18n/messages";
import {assertCapability, requireLocation, type OrganizationContext} from "../authorization/context";
import {prisma} from "../database/prisma";
import {publicMediaUrl} from "../storage/provider";
import {catalogDirectorySchema} from "./catalog-directory";
import {literalSearch} from "./customer-directory";
import type {MerchantWorkspaceData} from "./data";

export const locationDirectorySchema = catalogDirectorySchema;
export const resourceDirectorySchema = catalogDirectorySchema.extend({
  status: z.enum(["active", "all"]).default("active"),
  limit: z.coerce.number().int().min(1).max(50).default(6),
});
const kindLabels: Record<resource_kind, string> = {
  SPA_ROOM: "療程室", CHAIR: "座椅", NAIL_TABLE: "美甲桌",
  EYELASH_BED: "美睫床", EQUIPMENT: "設備", OTHER: "其他", ROOM: "其他", BED: "其他",
};

export async function listMerchantLocations(context: OrganizationContext, input: z.infer<typeof locationDirectorySchema>) {
  requireLocation(context);
  const contains = literalSearch(input.search);
  // The request context is branch-scoped; enumerate other branches only through verified memberships.
  const where: Prisma.locationsWhereInput = {
    organization_id: context.organization.id, is_active: true,
    ...(!context.allLocations ? {location_memberships: {some: {
      organization_id: context.organization.id, profile_id: context.session.profileId, status: "ACTIVE",
    }}} : {}),
    ...(contains ? {OR: ["name", "code", "address"].map(field => ({[field]: {contains, mode: "insensitive" as const}}))} : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.locations.count({where}),
    prisma.locations.findMany({where, skip: input.offset, take: input.limit,
      orderBy: [{created_at: "asc"}, {id: "asc"}], select: {
        id: true, name: true, slug: true, code: true, booking_state: true, online_booking_enabled: true,
        description: true, address: true, phone: true, cover_image_path: true,
      }}),
  ], {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
  const items: MerchantWorkspaceData["locations"] = records.map(row => ({
    id: row.id, name: row.name, slug: row.slug, code: row.code, bookingState: row.booking_state,
    onlineBookingEnabled: row.online_booking_enabled, description: row.description, address: row.address,
    phone: row.phone, coverImageUrl: publicMediaUrl(row.cover_image_path),
  }));
  return {items, total};
}

export async function listMerchantResources(context: OrganizationContext, input: z.infer<typeof resourceDirectorySchema>) {
  assertCapability(context, "resource.read");
  const location = requireLocation(context), contains = literalSearch(input.search);
  const matchingKinds = (Object.keys(kindLabels) as resource_kind[]).filter(kind =>
    (["zh-TW", "en", "vi"] as const).some(locale => translate(locale, kindLabels[kind]).toLowerCase().includes(input.search.toLowerCase())));
  const where: Prisma.resourcesWhereInput = {
    organization_id: context.organization.id, location_id: location.id,
    ...(input.status === "active" ? {is_active: true} : {}),
    ...(contains ? {OR: [
      {name: {contains, mode: "insensitive"}}, {resource_types: {name: {contains, mode: "insensitive"}}},
      {resource_types: {kind: {in: matchingKinds}}},
    ]} : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.resources.count({where}),
    prisma.resources.findMany({where, skip: input.offset, take: input.limit,
      orderBy: [{sort_order: "asc"}, {id: "asc"}], select: {
        id: true, name: true, is_active: true, resource_types: {select: {name: true, kind: true}},
      }}),
  ], {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
  const items: MerchantWorkspaceData["resources"] = records.map(row => ({
    id: row.id, name: row.name, typeName: row.resource_types.name, kind: row.resource_types.kind, isActive: row.is_active,
  }));
  return {items, total};
}
