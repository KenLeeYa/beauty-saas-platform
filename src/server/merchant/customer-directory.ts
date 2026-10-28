import "server-only";
import {Prisma} from "@prisma/client";
import {assertCapability, type OrganizationContext} from "../authorization/context";
import {hasCapability} from "../authorization/capabilities";
import {prisma} from "../database/prisma";
import {z} from "zod";

export const directoryQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(8),
  tag: z.union([z.literal("ALL"),z.uuid()]).default("ALL"),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

// PostgreSQL LIKE wildcards are literal user input, not search operators.
export function literalSearch(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }

export function customerSelect(canReadSensitiveCustomers: boolean) {
  return {
            id: true,
            display_name: true,
            birthday: true,
            deposit_mode: true,
            is_blacklisted: true,
            blacklist_reason: true,
            customer_contacts: {
              where: {
                contact_type: "PHONE",
                is_primary: true,
              },
              take: 1,
              select: {
                value: true,
              },
            },
            customer_metrics: {
              select: {
                last_service_at: true,
                completed_count: true,
                cancelled_count: true,
                no_show_count: true,
                total_spend_minor: true,
              },
            },
            customer_tag_assignments: {
              orderBy: {
                created_at: "asc",
              },
              select: {
                customer_tags: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
              },
            },
            customer_notes: {
              where: {
                deleted_at: null,
                ...(canReadSensitiveCustomers
                  ? {}
                  : { sensitivity: "STANDARD" as const }),
              },
              orderBy: {
                created_at: "desc",
              },
              take: 5,
              select: {
                id: true,
                note: true,
                sensitivity: true,
                created_at: true,
                profiles_customer_notes_created_byToprofiles: {
                  select: {
                    display_name: true,
                  },
                },
              },
            },
          } satisfies Prisma.customersSelect;
}
type CustomerRecord = Prisma.customersGetPayload<{select: ReturnType<typeof customerSelect>}>;
export function presentCustomers(records: CustomerRecord[], canReadSensitiveCustomers: boolean) {
  return records.map((customer) => ({
      id: customer.id,
      displayName: customer.display_name,
      phone: canReadSensitiveCustomers
        ? customer.customer_contacts[0]?.value ?? null
        : null,
      birthday: customer.birthday?.toISOString().slice(0, 10) ?? null,
      depositMode: customer.deposit_mode,
      isBlacklisted: customer.is_blacklisted,
      blacklistReason: customer.blacklist_reason,
      lastServiceAt:
        customer.customer_metrics?.last_service_at?.toISOString() ??
        null,
      completedCount:
        customer.customer_metrics?.completed_count ?? 0,
      cancelledCount:
        customer.customer_metrics?.cancelled_count ?? 0,
      noShowCount: customer.customer_metrics?.no_show_count ?? 0,
      totalSpendMinor:
        customer.customer_metrics?.total_spend_minor.toString() ??
        "0",
      tags: customer.customer_tag_assignments.map(
        (assignment) => ({
          id: assignment.customer_tags.id,
          name: assignment.customer_tags.name,
          color: assignment.customer_tags.color,
        }),
      ),
      notes: customer.customer_notes.map((note) => ({
        id: note.id,
        note: note.note,
        sensitivity: note.sensitivity,
        createdAt: note.created_at.toISOString(),
        authorName:
          note.profiles_customer_notes_created_byToprofiles.display_name,
      })),
    }));
}
export async function listMerchantCustomers(context: OrganizationContext, input: DirectoryQuery) {
  assertCapability(context, "customer.read");
  const sensitive = hasCapability(context.roles, "customer.sensitive.read");
  const contains = literalSearch(input.search);
  const where: Prisma.customersWhereInput = {
    organization_id: context.organization.id, is_active: true,
    ...(input.tag !== "ALL" ? {customer_tag_assignments:{some:{tag_id:input.tag}}} : {}),
    ...(contains ? {OR: [
      {display_name:{contains,mode:"insensitive"}},
      {customer_tag_assignments:{some:{customer_tags:{organization_id:context.organization.id,name:{contains,mode:"insensitive"}}}}},
      ...(sensitive ? [{customer_contacts:{some:{contact_type:"PHONE" as const,value:{contains,mode:"insensitive" as const}}}}] : []),
    ]} : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.customers.count({where}),
    prisma.customers.findMany({where, orderBy:[{created_at:"desc"},{id:"asc"}],skip:input.offset,take:input.limit,select:customerSelect(sensitive)}),
  ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  return {items:presentCustomers(records,sensitive),total};
}
