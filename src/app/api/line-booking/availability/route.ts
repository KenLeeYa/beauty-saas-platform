import {message,availabilityQuery} from '@/lib/line-booking/validation';
import {withDb} from '@/lib/line-booking/db';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {requireMobileBookingContext} from '@/server/mobile/context';
import {getPublicAvailability} from '@/server/public-booking/availability';
import {consumeRateLimit} from '@/server/security/rate-limit';

export async function GET(request: Request) {
  try {
    const q=availabilityQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (!localDemoEnabled(request.headers.get('host'))) {
      const {actor:mobileActor,context}=await requireMobileBookingContext(request,q.store);
      await consumeRateLimit({scope:`mobile-availability:${context.locationId}`,
        identifier:mobileActor.sessionId,limit:120,windowMs:10*60_000});
      const availability=await getPublicAvailability(context,{serviceVariantId:q.service,staffProfileId:q.staff,date:q.date});
      return Response.json({slots:availability.slots.filter(slot=>!q.staff || slot.availableStaff.includes(q.staff)).map(slot=>slot.startsAt)});
    }
    if (!q.staff) throw Error('staff unavailable');
    const rows=await withDb(async client=>{
      const result=await client.query(`with selected as (
        select st.id as store_id,sv.id as service_id,sf.id as staff_id,st.timezone,
          sv.duration_minutes+sv.buffer_minutes as minutes
        from line_booking.stores st
        join line_booking.services sv on sv.store_id=st.id and sv.id=$2
        join line_booking.staff sf on sf.store_id=st.id and sf.id=$3
        join line_booking.staff_skills sk on sk.store_id=st.id and sk.service_id=sv.id and sk.staff_id=sf.id
        where st.slug=$1
      ), slots as (
        select x.start_at, s.* from selected s
        cross join lateral generate_series(
          ($4::date::timestamp at time zone s.timezone),
          (($4::date+1)::timestamp at time zone s.timezone)-make_interval(mins=>s.minutes),
          interval '30 minutes') x(start_at)
      )
      select start_at from slots s
      where start_at>now()
        and exists(select 1 from line_booking.staff_windows w where w.store_id=s.store_id and w.staff_id=s.staff_id and w.kind='work' and w.during @> tstzrange(s.start_at,s.start_at+make_interval(mins=>s.minutes),'[)'))
        and not exists(select 1 from line_booking.staff_windows w where w.store_id=s.store_id and w.staff_id=s.staff_id and w.kind='leave' and w.during && tstzrange(s.start_at,s.start_at+make_interval(mins=>s.minutes),'[)'))
        and not exists(select 1 from line_booking.allocations a join line_booking.bookings b on b.id=a.booking_id and b.store_id=a.store_id where a.store_id=s.store_id and a.active and (b.status='confirmed' or (b.status='hold' and b.hold_until>now())) and a.during && tstzrange(s.start_at,s.start_at+make_interval(mins=>s.minutes),'[)') and (a.staff_id=s.staff_id or a.resource_id in (select resource_id from line_booking.service_resources where store_id=s.store_id and service_id=s.service_id)))
        and not exists(select 1 from line_booking.resource_windows w join line_booking.service_resources r on r.resource_id=w.resource_id and r.store_id=w.store_id where r.store_id=s.store_id and r.service_id=s.service_id and w.kind='leave' and w.during && tstzrange(s.start_at,s.start_at+make_interval(mins=>s.minutes),'[)'))
      order by start_at`,[q.store,q.service,q.staff,q.date]);
      return result.rows;
    });
    return Response.json({slots:rows.map(row=>row.start_at)});
  } catch(error) {return Response.json({error:message(error)},{status:400});}
}
