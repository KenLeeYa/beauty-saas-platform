create table public.staff_attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  device_session_hash text not null check (length(device_session_hash) = 64),
  idempotency_hash text not null check (length(idempotency_hash) = 64),
  constraint staff_attendance_events_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint staff_attendance_events_idempotency_unique
    unique (organization_id, profile_id, idempotency_hash)
);
create index staff_attendance_events_timeline_idx
  on public.staff_attendance_events (organization_id, profile_id, occurred_at, recorded_at);

create table public.staff_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.staff_attendance_events(id),
  corrected_at timestamptz not null,
  reason text not null check (length(btrim(reason)) > 0),
  approved_by_profile_id uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  constraint staff_attendance_corrections_unique unique (event_id)
);

create table public.staff_attendance_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  retention_days integer not null default 3650 check (retention_days between 365 and 36500),
  standard_daily_minutes integer not null default 480
    check (standard_daily_minutes between 60 and 1440),
  overtime_requires_approval boolean not null default true,
  updated_by_profile_id uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create function beauty_private.prevent_attendance_change() returns trigger
language plpgsql as $$ begin raise exception 'Attendance history is append-only'; end $$;
create trigger staff_attendance_events_append_only before update or delete on public.staff_attendance_events
  for each row execute function beauty_private.prevent_attendance_change();
create trigger staff_attendance_corrections_append_only before update or delete on public.staff_attendance_corrections
  for each row execute function beauty_private.prevent_attendance_change();

alter table public.staff_attendance_events enable row level security;
alter table public.staff_attendance_corrections enable row level security;
alter table public.staff_attendance_settings enable row level security;
-- Read/write through verified server roles; no direct public RLS policy.
