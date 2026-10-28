import { publicMessage } from '@/lib/line-booking/validation';
import {message,changeInput} from '@/lib/line-booking/validation';
import {withDb} from '@/lib/line-booking/db';
import {actor} from '@/lib/line-booking/auth';
import {requireSameOrigin} from '@/lib/line-booking/request-security';
import {requirePrototype} from '@/lib/line-booking/prototype-guard';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {requireMobileBookingContext} from '@/server/mobile/context';
import {prisma} from '@/server/database/prisma';
import {createBookingHold} from '@/server/public-booking/hold';
import {cancelPublicBookingByCustomer,reschedulePublicBooking} from '@/server/public-booking/booking';
import {sha256} from '@/server/security/crypto';
import {AppError} from '@/server/http/errors';
import {consumeRateLimit} from '@/server/security/rate-limit';
import {resolveMobileEmployeeContext} from '@/server/mobile/employee-context';
import {updateMerchantBookingStatus} from '@/server/merchant/bookings';

export async function PATCH(request: Request,{params}: {params: Promise<{id:string}>}) {
  try {
    requireSameOrigin(request);
    const {id}=await params; const input=changeInput.parse(await request.json() as unknown);
    if (!localDemoEnabled(request.headers.get('host'))) {
      const {actor:mobileActor,context}=await requireMobileBookingContext(request,input.store);
      await consumeRateLimit({scope:`mobile-booking-change:${context.locationId}`,
        identifier:mobileActor.sessionId,limit:12,windowMs:30*60_000});
      if (mobileActor.kind==='employee') {
        const employeeContext=await resolveMobileEmployeeContext(mobileActor,context);
        const canManageAll=mobileActor.capabilities.has('booking.manage');
        const ownStaffId=employeeContext.linkedStaffProfileId;
        if (!canManageAll && (!mobileActor.capabilities.has('booking.own.manage') || !ownStaffId))
          throw new AppError('FORBIDDEN','Booking management denied',403);
        const booking=await prisma.bookings.findFirst({where:{id,
          organization_id:context.organizationId,location_id:context.locationId,
          ...(!canManageAll?{booking_segments:{some:{assigned_staff_id:ownStaffId!}}}:{})},
          select:{id:true,status:true,version:true,booking_segments:{orderBy:{sort_order:'asc'},take:1,
            select:{service_variant_id:true,assigned_staff_id:true}}}});
        if(!booking)throw new AppError('NOT_FOUND','Booking not found',404);
        if(input.action==='cancel') {
          if(booking.status==='CANCELLED')return Response.json({id,status:'CANCELLED'});
          return Response.json(await updateMerchantBookingStatus({context:employeeContext,
            bookingId:id,nextStatus:'CANCELLED',expectedVersion:booking.version,
            reason:'Cancelled from staff mobile agenda',requestId:context.requestId}));
        }
        const segment=booking.booking_segments[0];
        if(!segment?.service_variant_id||!segment.assigned_staff_id||!input.start)
          throw new AppError('CONFLICT','Booking cannot be rescheduled',409);
        const idempotencyKey=sha256(`${mobileActor.sessionId}:${id}:${input.start}:reschedule`);
        const hold=await createBookingHold({context,serviceVariantId:segment.service_variant_id,
          staffProfileId:segment.assigned_staff_id,startsAt:input.start,idempotencyKey});
        const changed=await reschedulePublicBooking({context,
          authorizedBooking:{id,manageAll:canManageAll,staffProfileId:ownStaffId??undefined},
          holdToken:hold.holdToken,idempotencyKey,keepSessionActive:true});
        return Response.json({id:changed.booking.id,status:changed.booking.status});
      }
      if (mobileActor.kind!=='customer' || !mobileActor.customerId) throw new AppError('FORBIDDEN','Customer link required',403);
      if (input.action==='cancel') return Response.json(await cancelPublicBookingByCustomer({
        bookingId:id,organizationId:context.organizationId,locationId:context.locationId,
        customerId:mobileActor.customerId,reason:'Customer requested cancellation',requestId:context.requestId}));
      const original=await prisma.bookings.findFirst({where:{id,
        organization_id:context.organizationId,location_id:context.locationId,
        customer_id:mobileActor.customerId},select:{booking_segments:{orderBy:{sort_order:'asc'},take:1,
          select:{service_variant_id:true,assigned_staff_id:true}}}});
      const segment=original?.booking_segments[0];
      if (!segment?.service_variant_id || !segment.assigned_staff_id || !input.start) throw new AppError('NOT_FOUND','Booking not found',404);
      const idempotencyKey=sha256(`${mobileActor.sessionId}:${id}:${input.start}:reschedule`);
      const hold=await createBookingHold({context,serviceVariantId:segment.service_variant_id,
        staffProfileId:segment.assigned_staff_id,startsAt:input.start,idempotencyKey});
      const changed=await reschedulePublicBooking({context,
        authorizedBooking:{id,customerId:mobileActor.customerId},holdToken:hold.holdToken,
        idempotencyKey,keepSessionActive:true});
      return Response.json({id:changed.booking.id,status:changed.booking.status});
    }
    requirePrototype(request);
    const result=await withDb(async client=>{
      await client.query('BEGIN');
      try {
        const {rows:[store]}=await client.query('select id,line_provider_id,line_channel_id from line_booking.stores where slug=$1',[input.store]);
        if(!store) throw Error('store not found');
        const subject=actor(request,store);
        const {rows:[row]}=await client.query('select * from line_booking.change_booking($1,$2,$3,$4,$5)',[store.id,id,subject,input.action,input.start||null]);
        await client.query('COMMIT');return {id:row.id,status:row.status};
      } catch(error) {await client.query('ROLLBACK');throw error;}
    });
    return Response.json(result);
  } catch(error) {
    if (error instanceof AppError) return Response.json({error:publicMessage(error, request)},{status:error.status});
    return Response.json({error:publicMessage(error, request)},{status:/authentication|LINE identity/.test(message(error))?401:/forbidden/.test(message(error))?403:400});
  }
}
