import "server-only";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {assertCapability,requireLocation,type OrganizationContext} from "../authorization/context";
import {hasCapability} from "../authorization/capabilities";
import {prisma} from "../database/prisma";
import {directoryQuerySchema,literalSearch} from "./customer-directory";

export const bookingDirectorySchema=directoryQuerySchema.extend({status:z.enum(["ALL","PENDING_PAYMENT","CONFIRMED","CHECKED_IN","IN_SERVICE","COMPLETED","CANCELLED","NO_SHOW","EXPIRED","RESCHEDULED"]).default("ALL")});
export async function listMerchantBookings(context:OrganizationContext,input:z.infer<typeof bookingDirectorySchema>) {
  assertCapability(context,"booking.read");
  const location=requireLocation(context);
  const canReadSensitiveCustomers=hasCapability(context.roles,"customer.sensitive.read");
  const contains=literalSearch(input.search);
  const where:Prisma.bookingsWhereInput={
    organization_id:context.organization.id,location_id:location.id,
    booking_segments:{some:{organization_id:context.organization.id,location_id:location.id}},
    ...(input.status==="ALL" ? {} : {status:input.status}),
    ...(contains ? {OR:[
      {customers:{display_name:{contains,mode:"insensitive"}}},
      {booking_segments:{some:{OR:[{service_name_snapshot:{contains,mode:"insensitive"}},{staff_name_snapshot:{contains,mode:"insensitive"}}]}}},
      ...(canReadSensitiveCustomers ? [{customers:{customer_contacts:{some:{contact_type:"PHONE" as const,value:{contains,mode:"insensitive" as const}}}}}] : []),
    ]} : {}),
  };
  const [total,records]=await prisma.$transaction([
    prisma.bookings.count({where}),
    prisma.bookings.findMany({where,orderBy:[{created_at:"desc"},{id:"asc"}],skip:input.offset,take:input.limit,select:{
            id: true,
            status: true,
            payment_status: true,
            version: true,
            total_minor: true,
            deposit_required_minor: true,
            paid_minor: true,
            currency: true,
            source: true,
            customers: {
              select: {
                display_name: true,
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
              },
            },
            booking_segments: {
              orderBy: {
                sort_order: "asc",
              },
              take: 1,
              select: {
                service_name_snapshot: true,
                variant_name_snapshot: true,
                staff_name_snapshot: true,
                starts_at: true,
                ends_at: true,
              },
            },
          }}),
  ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  const items=records.flatMap((booking) => {
    const segment = booking.booking_segments[0];
    if (!segment) {
      return [];
    }
    return [
      {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.payment_status,
        version: booking.version,
        totalMinor: booking.total_minor,
        depositRequiredMinor: booking.deposit_required_minor,
        paidMinor: booking.paid_minor,
        currency: booking.currency,
        customerName: booking.customers.display_name,
        customerPhone:
          canReadSensitiveCustomers
            ? booking.customers.customer_contacts[0]?.value ?? null
            : null,
        serviceName: segment.service_name_snapshot,
        variantName: segment.variant_name_snapshot,
        staffName: segment.staff_name_snapshot,
        startsAt: segment.starts_at.toISOString(),
        endsAt: segment.ends_at.toISOString(),
        source: booking.source,
      },
    ];
  });
  return {items,total};
}
