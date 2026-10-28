import { publicMessage } from '@/lib/line-booking/validation';
import {actor} from '@/lib/line-booking/auth';
import {withDb} from '@/lib/line-booking/db';
import {message, storeQuery} from '@/lib/line-booking/validation';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {requireMobileBookingContext} from '@/server/mobile/context';
import {prisma} from '@/server/database/prisma';
import {AppError} from '@/server/http/errors';

export async function GET(request: Request) {
  try {
    const slug = storeQuery.parse(Object.fromEntries(new URL(request.url).searchParams)).store;
    if (!localDemoEnabled(request.headers.get('host'))) {
      const {actor:mobileActor,context}=await requireMobileBookingContext(request,slug);
      if (mobileActor.kind!=='customer' || !mobileActor.customerId) return Response.json({bookings:[]});
      const rows=await prisma.bookings.findMany({where:{
        organization_id:context.organizationId,location_id:context.locationId,
        customer_id:mobileActor.customerId,status:{in:['CONFIRMED','PENDING_PAYMENT']},
        booking_segments:{some:{starts_at:{gte:new Date(Date.now()-24*3600000)}}},
      },select:{id:true,status:true,booking_segments:{orderBy:{sort_order:'asc'},take:1,
        select:{service_variant_id:true,assigned_staff_id:true,starts_at:true,ends_at:true,
          service_name_snapshot:true,staff_name_snapshot:true}}},take:50});
      return Response.json({bookings:rows.flatMap(row=>{
        const segment=row.booking_segments[0];
        return segment?[{id:row.id,service_id:segment.service_variant_id,
          staff_id:segment.assigned_staff_id,start:segment.starts_at.toISOString(),
          finish:segment.ends_at.toISOString(),status:row.status,
          service_name:segment.service_name_snapshot,staff_name:segment.staff_name_snapshot}]:[];
      }).sort((a,b)=>a.start.localeCompare(b.start))},{headers:{'Cache-Control':'no-store'}});
    }
    const result = await withDb(async client => {
      const {rows: [store]} = await client.query(
        'select id,line_provider_id,line_channel_id from line_booking.stores where slug=$1', [slug]);
      if (!store) throw Error('store not found');
      const subject = actor(request, store);
      const {rows} = await client.query(`
        select b.id, b.service_id, b.staff_id, lower(b.during) as start,
          upper(b.during) as finish, b.status, sv.name as service_name,
          sf.name as staff_name
        from line_booking.bookings b
        join line_booking.services sv on sv.id=b.service_id and sv.store_id=b.store_id
        join line_booking.staff sf on sf.id=b.staff_id and sf.store_id=b.store_id
        where b.store_id=$1 and b.customer_subject=$2
          and b.status='confirmed' and lower(b.during)>=now()-interval '1 day'
        order by lower(b.during) limit 50`, [store.id, subject]);
      return {bookings: rows};
    });
    return Response.json(result, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    if (error instanceof AppError) return Response.json({error:publicMessage(error, request)},{status:error.status});
    const detail = message(error);
    return Response.json({error: publicMessage(error, request)}, {status: /authentication|session/.test(detail) ? 401 : /forbidden/.test(detail) ? 403 : 400});
  }
}
