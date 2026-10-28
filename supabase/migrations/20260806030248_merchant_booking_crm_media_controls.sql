create type public.organization_entity_type as enum (
  'SOLE_PROPRIETOR',
  'COMPANY'
);

create type public.customer_deposit_mode as enum (
  'DEFAULT',
  'REQUIRED',
  'EXEMPT'
);

alter type public.feature_key add value if not exists 'CUSTOMER_BLACKLIST';

alter table public.organizations
  add column entity_type public.organization_entity_type not null
    default 'SOLE_PROPRIETOR',
  add column brand_description text not null default '',
  add column brand_logo_path text,
  add column brand_cover_image_path text;

alter table public.customers
  add column deposit_mode public.customer_deposit_mode not null
    default 'DEFAULT',
  add column is_blacklisted boolean not null default false,
  add column blacklist_reason text,
  add column blacklisted_at timestamptz,
  add constraint customers_blacklist_state_check check (
    (
      is_blacklisted
      and blacklisted_at is not null
      and nullif(btrim(blacklist_reason), '') is not null
    )
    or (
      not is_blacklisted
      and blacklisted_at is null
      and blacklist_reason is null
    )
  );

alter table public.location_booking_policies
  add column deposits_enabled boolean not null default false;

update public.location_booking_policies policy
set deposits_enabled = exists (
  select 1
  from public.deposit_policies deposit
  where deposit.organization_id = policy.organization_id
    and deposit.location_id = policy.location_id
    and deposit.is_active
    and deposit.mode <> 'NONE'::public.deposit_mode
);

create table public.location_day_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id)
    on delete cascade,
  location_id uuid not null,
  schedule_date date not null,
  segment_index smallint not null default 0,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_day_schedules_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint location_day_schedules_segment_check check (
    segment_index between 0 and 2
  ),
  constraint location_day_schedules_window_check check (
    (is_closed and opens_at is null and closes_at is null)
    or (
      not is_closed
      and opens_at is not null
      and closes_at is not null
      and opens_at < closes_at
    )
  ),
  constraint location_day_schedules_unique unique (
    location_id,
    schedule_date,
    segment_index
  )
);

create index location_day_schedules_scope_idx
  on public.location_day_schedules (
    organization_id,
    location_id,
    schedule_date
  );

create trigger location_day_schedules_updated_at
before update on public.location_day_schedules
for each row execute function beauty_private.set_updated_at();

alter table public.location_day_schedules enable row level security;
alter table public.location_day_schedules force row level security;

grant select on public.location_day_schedules to authenticated;

create policy location_day_schedules_authorized_select
on public.location_day_schedules
for select
to authenticated
using (
  beauty_private.can_access_location(location_id)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'beauty-public',
  'beauty-public',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
