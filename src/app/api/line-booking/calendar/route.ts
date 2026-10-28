import { publicMessage } from '@/lib/line-booking/validation';
import {message,storeQuery} from '@/lib/line-booking/validation';
import {withDb} from '@/lib/line-booking/db';
import {actor} from '@/lib/line-booking/auth';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {requireMobileBookingContext} from '@/server/mobile/context';
import {maskMobileAgenda} from '@/server/mobile/calendar-mapper';
import {prisma} from '@/server/database/prisma';
import {AppError} from '@/server/http/errors';
import {addLocalDays,zonedDateTimeToUtc} from '@/server/time/timezone';
import {z} from 'zod';

export async function GET(request: Request) {
  try {
    const slug=storeQuery.parse(Object.fromEntries(new URL(request.url).searchParams)).store;
    if (!localDemoEnabled(request.headers.get('host'))) {
      const {actor:mobileActor,context}=await requireMobileBookingContext(request,slug);
      if (mobileActor.kind!=='employee') throw new AppError('FORBIDDEN','Staff access required',403);
      const canReadLocation=mobileActor.capabilities.has('booking.read');
      if (!canReadLocation && !mobileActor.capabilities.has('booking.own.read')) throw new AppError('FORBIDDEN','Calendar access denied',403);
      const ownStaff=mobileActor.profileId?await prisma.staff_profiles.findFirst({where:{
        organization_id:context.organizationId,linked_profile_id:mobileActor.profileId,is_active:true},
        select:{id:true}}):null;
      if (!canReadLocation && !ownStaff) throw new AppError('FORBIDDEN','Staff profile required',403);
      const requestedDate=new URL(request.url).searchParams.get('date');
      const date=requestedDate?z.iso.date().parse(requestedDate):null;
      const start=date?zonedDateTimeToUtc(date,'00:00',context.timezone):
        new Date(Date.now()-24*3600000);
      const end=date?zonedDateTimeToUtc(addLocalDays(date,1),'00:00',context.timezone):
        new Date(Date.now()+31*24*3600000);
      const rows=await prisma.booking_segments.findMany({where:{
        organization_id:context.organizationId,location_id:context.locationId,
        starts_at:{gte:start,lt:end},
        bookings:{status:{in:['CONFIRMED','PENDING_PAYMENT','CHECKED_IN','IN_SERVICE']}},
      },select:{booking_id:true,assigned_staff_id:true,starts_at:true,ends_at:true,
        service_name_snapshot:true,staff_name_snapshot:true,
        bookings:{select:{source:true,customers:{select:{display_name:true,
          customer_contacts:{where:{contact_type:'PHONE',is_primary:true},take:1,
            select:{normalized_value:true}}}}}}},orderBy:{starts_at:'asc'},
        ...(date?{}:{take:200})});
      const bookings=maskMobileAgenda(rows.filter(row=>row.assigned_staff_id).map(row=>({
        id:row.booking_id,staffId:row.assigned_staff_id!,start:row.starts_at.toISOString(),
        finish:row.ends_at.toISOString(),customerName:row.bookings.customers.display_name,
        phone:row.bookings.customers.customer_contacts[0]?.normalized_value??null,
        serviceName:row.service_name_snapshot,staffName:row.staff_name_snapshot,
        source:row.bookings.source,
      })),canReadLocation,ownStaff?.id??null);
      const role=mobileActor.capabilities.has('organization.manage')?'owner':
        canReadLocation?'reception':'staff';
      return Response.json({role,bookings},{headers:{'Cache-Control':'no-store'}});
    }
    const result=await withDb(async client=>{
      const {rows:[store]}=await client.query('select id from line_booking.stores where slug=$1',[slug]);
      if(!store) throw Error('store not found');
      const subject=actor(request,store);
      const {rowCount:owner}=await client.query('select 1 from line_booking.store_owners where store_id=$1 and line_subject=$2',[store.id,subject]);
      const {rows:[staff]}=await client.query('select id from line_booking.staff where store_id=$1 and line_subject=$2',[store.id,subject]);
      if(!owner&&!staff) throw Error('forbidden');
      const {rows}=await client.query("select b.id,b.service_id,b.staff_id,lower(b.during) as start,upper(b.during) as finish,b.customer_name,b.phone,b.source,sv.name as service_name,sf.name as staff_name from line_booking.bookings b join line_booking.services sv on sv.id=b.service_id and sv.store_id=b.store_id join line_booking.staff sf on sf.id=b.staff_id and sf.store_id=b.store_id where b.store_id=$1 and b.status='confirmed' and lower(b.during)>=now()-interval '1 day' and lower(b.during)<now()+interval '31 days' order by lower(b.during)",[store.id]);
      return {role:owner?'owner':'staff',bookings:rows.map(row=>owner||row.staff_id===staff.id?row:{id:row.id,staff_id:row.staff_id,start:row.start,finish:row.finish,busy:true})};
    });
    return Response.json(result);
  } catch(error) {if(error instanceof AppError) return Response.json({error:publicMessage(error, request)},{status:error.status});return Response.json({error:publicMessage(error, request)},{status:/authentication|session/.test(message(error))?401:/forbidden/.test(message(error))?403:400});}
}
