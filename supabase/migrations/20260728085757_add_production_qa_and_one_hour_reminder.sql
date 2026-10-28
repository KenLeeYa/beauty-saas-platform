alter type public.notification_event_type
  add value if not exists 'BOOKING_REMINDER_1H'
  after 'BOOKING_REMINDER_3H';

alter table public.organizations
  add column if not exists is_test boolean not null default false;

alter table public.location_booking_policies
  alter column reminder_hours set default array[24, 1];

update public.location_booking_policies
set reminder_hours = array_append(reminder_hours, 1)
where not (1 = any(reminder_hours));
