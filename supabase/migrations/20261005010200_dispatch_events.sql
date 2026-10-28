-- Claims serialize rotation choice; allocation exclusion remains the final capacity guard.
create table public.booking_dispatch_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  service_variant_id uuid not null,
  staff_profile_id uuid not null,
  booking_id uuid,
  idempotency_hash text not null check (length(idempotency_hash) = 64),
  mode text not null check (mode in ('IMMEDIATE', 'FUTURE')),
  starts_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_dispatch_claims_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade,
  constraint booking_dispatch_claims_staff_fk foreign key (organization_id, staff_profile_id)
    references public.staff_profiles(organization_id, id),
  constraint booking_dispatch_claims_booking_fk foreign key (organization_id, booking_id)
    references public.bookings(organization_id, id),
  constraint booking_dispatch_claims_unique unique (organization_id, location_id, idempotency_hash)
);
create index booking_dispatch_claims_rotation_idx
  on public.booking_dispatch_claims (organization_id, location_id, mode, starts_at, status);

create table public.booking_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  claim_id uuid not null references public.booking_dispatch_claims(id),
  booking_id uuid not null,
  staff_profile_id uuid not null,
  event_type text not null check (event_type in
    ('IMMEDIATE_ASSIGNED', 'FUTURE_RESERVED', 'PRESTART_COMPENSATED', 'REASSIGNED', 'OVERRIDE')),
  reason text not null default '',
  occurred_at timestamptz not null default now(),
  constraint booking_dispatch_events_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade,
  constraint booking_dispatch_events_booking_fk foreign key (organization_id, booking_id)
    references public.bookings(organization_id, id)
);
create unique index booking_dispatch_events_first_confirmation
  on public.booking_dispatch_events (claim_id)
  where event_type in ('IMMEDIATE_ASSIGNED', 'FUTURE_RESERVED');
create unique index booking_dispatch_events_one_compensation
  on public.booking_dispatch_events (claim_id)
  where event_type = 'PRESTART_COMPENSATED';
create unique index booking_dispatch_events_one_reassignment
  on public.booking_dispatch_events (claim_id)
  where event_type = 'REASSIGNED';

alter table public.booking_dispatch_claims enable row level security;
alter table public.booking_dispatch_events enable row level security;
create policy booking_dispatch_claims_read on public.booking_dispatch_claims
  for select to authenticated using (beauty_private.can_access_location(location_id));
create policy booking_dispatch_events_read on public.booking_dispatch_events
  for select to authenticated using (beauty_private.can_access_location(location_id));
