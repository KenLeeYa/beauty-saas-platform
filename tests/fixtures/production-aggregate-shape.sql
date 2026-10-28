-- Synthetic historical distribution only. No production identifiers or values.
insert into public.public_booking_sessions
  (organization_id, location_id, token_hash, status, expires_at, allowed_origin)
select loc.organization_id, loc.id, 'shape-session-' || n::text, 'EXPIRED',
  now() - interval '45 days', 'https://fixture.invalid'
from public.locations loc cross join generate_series(1, 20) n
where loc.id = '22222222-2222-4222-8222-222222222221'::uuid;

insert into public.booking_holds
  (organization_id, location_id, public_booking_session_id,
   service_variant_id, staff_profile_id, starts_at, ends_at,
   status, token_hash, idempotency_key_hash, expires_at,
   confirmed_at, cancelled_at, created_at)
select sess.organization_id, sess.location_id, sess.id,
  (select id from public.service_variants order by created_at, id limit 1),
  (select id from public.staff_profiles order by created_at, id limit 1),
  now() - interval '40 days' + n * interval '1 day',
  now() - interval '40 days' + n * interval '1 day' + interval '1 hour',
  case when n <= 14 then 'EXPIRED' when n <= 19 then 'CANCELLED'
       else 'CONFIRMED' end::public.booking_hold_status,
  'shape-hold-' || n::text, 'shape-idempotency-' || n::text,
  now() - interval '39 days' + n * interval '1 day',
  case when n = 20 then now() - interval '20 days' else null end,
  case when n between 15 and 19 then now() - interval '20 days' else null end,
  now() - interval '60 days'
from generate_series(1,20) n
join public.public_booking_sessions sess
  on sess.token_hash = 'shape-session-' || n::text;

insert into public.booking_staff_allocations
  (organization_id, location_id, booking_hold_id, staff_profile_id,
   starts_at, ends_at, is_blocking)
select hold.organization_id, hold.location_id, hold.id, hold.staff_profile_id,
  hold.starts_at, hold.ends_at, false
from public.booking_holds hold
where hold.token_hash like 'shape-hold-%' and hold.token_hash <> 'shape-hold-20';

insert into public.booking_resource_allocations
  (organization_id, location_id, booking_hold_id, resource_id,
   starts_at, ends_at, is_blocking)
select hold.organization_id, hold.location_id, hold.id,
  (select id from public.resources order by created_at, id limit 1),
  hold.starts_at, hold.ends_at, false
from public.booking_holds hold
where hold.token_hash like 'shape-hold-%' and hold.token_hash <> 'shape-hold-20';
