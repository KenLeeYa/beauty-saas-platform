-- Extend the existing location/service/staff assignment; do not create a second skill authority.
alter table public.service_staff_assignments
  add column effective_from timestamptz not null default '2000-01-01T00:00:00Z',
  add column effective_until timestamptz,
  add column walk_in_eligible boolean not null default true;

alter table public.service_staff_assignments
  add constraint service_staff_assignment_effective_range
  check (effective_until is null or effective_until > effective_from);

create index service_staff_assignments_terms_idx
  on public.service_staff_assignments
    (organization_id, location_service_id, staff_profile_id, effective_from, effective_until)
  where is_active;

create table public.staff_capability_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  assignment_id uuid not null references public.service_staff_assignments(id),
  actor_profile_id uuid not null references public.profiles(id),
  effective_from timestamptz not null,
  effective_until timestamptz,
  online_booking_enabled boolean not null,
  walk_in_eligible boolean not null,
  reason text not null check (length(btrim(reason)) > 0),
  occurred_at timestamptz not null default now(),
  constraint staff_capability_events_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade
);

create index staff_capability_events_assignment_idx
  on public.staff_capability_events (assignment_id, occurred_at desc);

alter table public.staff_capability_events enable row level security;
create policy staff_capability_events_read on public.staff_capability_events
  for select to authenticated using (beauty_private.can_access_location(location_id));
