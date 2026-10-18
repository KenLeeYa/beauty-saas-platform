import { withDb } from '@/lib/line-booking/db';
import { actor } from '@/lib/line-booking/auth';
import {requireSameOrigin} from '@/lib/line-booking/request-security';
import {bookingInput,message} from '@/lib/line-booking/validation';
import {requirePrototype} from '@/lib/line-booking/prototype-guard';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {requireMobileBookingContext} from '@/server/mobile/context';
import {bookMobile} from '@/server/mobile/booking';
import {AppError} from '@/server/http/errors';
import {consumeRateLimit} from '@/server/security/rate-limit';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input=bookingInput.parse(await request.json() as unknown);
    if (!localDemoEnabled(request.headers.get('host'))) {
      if (input.hold) throw new AppError('BAD_REQUEST','Confirm contact details with the booking request',400);
      const {actor:mobileActor,context}=await requireMobileBookingContext(request,input.store);
      await consumeRateLimit({scope:`mobile-booking:${context.locationId}`,
        identifier:mobileActor.sessionId,limit:12,windowMs:30*60_000});
      return Response.json(await bookMobile({actor:mobileActor,context,
        serviceVariantId:input.serviceId,staffProfileId:input.staffId,startsAt:input.start,
        name:input.name,phone:input.phone,source:input.source,
        idempotencyKey:input.idempotencyKey,holdOnly:input.hold,
        dispatchMode:input.dispatchMode}),{status:201});
    }
    requirePrototype(request);
    if (!input.staffId) throw new AppError('BAD_REQUEST','Staff selection required in local trial',400);
    const result=await withDb(async client=>{
      await client.query('BEGIN');
      try {
        const {rows:[store]}=await client.query('select id,line_provider_id,line_channel_id from line_booking.stores where slug=$1',[input.store]);
        if(!store) throw Error('store not found');
        const subject=actor(request,store);
        const source=input.source==='phone'||input.source==='personal-line'?input.source:'line';
        if(source!=='line') {
          const staff=await client.query('select 1 from line_booking.staff where store_id=$1 and line_subject=$2 union select 1 from line_booking.store_owners where store_id=$1 and line_subject=$2',[store.id,subject]);
          if(!staff.rowCount) throw Error('forbidden');
        }
        const {rows:[booking]}=await client.query('select * from line_booking.create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[store.id,input.serviceId,input.staffId,input.start,subject,source==='line'?subject:null,input.name,input.phone,source,input.idempotencyKey,Boolean(input.hold)]);
        await client.query('COMMIT');
        return {id:booking.id,status:booking.status,start:booking.during};
      } catch(error) {await client.query('ROLLBACK');throw error;}
    });
    return Response.json(result,{status:201});
  } catch(error) {
    if (error instanceof AppError) return Response.json({error:error.message},{status:error.status});
    const detail=message(error);const status=/authentication|LINE identity/.test(detail)?401:/forbidden/.test(detail)?403:400;
    return Response.json({error:detail},{status});
  }
}
