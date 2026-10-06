-- A missing row intentionally disables immediate walk-in dispatch.
create table public.store_walkin_policies (
  organization_id uuid not null,
  location_id uuid not null,
  earliest_start_minutes integer not null check (earliest_start_minutes between 0 and 1440),
  setup_buffer_minutes integer not null check (setup_buffer_minutes between 0 and 240),
  online_minimum_advance_applies boolean not null,
  version integer not null default 1 check (version > 0),
  configured_by_profile_id uuid not null references public.profiles(id),
  configured_at timestamptz not null default now(),
  primary key (organization_id,location_id),
  foreign key (organization_id,location_id)
    references public.locations(organization_id,id) on delete cascade
);
alter table public.store_walkin_policies enable row level security;
-- Server only: configuration requires location.manage and is audit logged.
