-- Configuration references only. Channel credentials belong in server secrets.
create table public.mobile_store_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  entry_slug text not null unique check (entry_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_store_entries_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade,
  constraint mobile_store_entries_location_unique unique (organization_id, location_id)
);

create trigger mobile_store_entries_updated_at before update on public.mobile_store_entries
  for each row execute function beauty_private.set_updated_at();

alter table public.mobile_store_entries enable row level security;
create policy mobile_store_entries_manager_read on public.mobile_store_entries
  for select to authenticated using (beauty_private.can_access_location(location_id));

create table public.store_line_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  provider_id text not null check (length(btrim(provider_id)) > 0),
  channel_id text not null check (length(btrim(channel_id)) > 0),
  purpose text not null default 'LOGIN' check (purpose in ('LOGIN', 'MESSAGING')),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_line_channels_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade,
  constraint store_line_channels_scope_unique unique (organization_id, location_id, channel_id)
);

create unique index store_line_channels_active_channel_unique
  on public.store_line_channels (channel_id) where is_enabled;
create unique index store_line_channels_active_purpose_unique
  on public.store_line_channels (organization_id, location_id, purpose) where is_enabled;

create trigger store_line_channels_updated_at before update on public.store_line_channels
  for each row execute function beauty_private.set_updated_at();

alter table public.store_line_channels enable row level security;

create policy store_line_channels_read on public.store_line_channels
  for select to authenticated using (beauty_private.can_access_location(location_id));

-- No client write policy: an audited server-side configuration flow must approve activation.

create table public.store_module_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  feature_key public.feature_key not null,
  is_active boolean not null default false,
  updated_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_module_activations_location_fk foreign key (organization_id,location_id)
    references public.locations(organization_id,id) on delete cascade,
  constraint store_module_activations_unique unique (organization_id,location_id,feature_key)
);
create trigger store_module_activations_updated_at before update on public.store_module_activations
  for each row execute function beauty_private.set_updated_at();
alter table public.store_module_activations enable row level security;
create policy store_module_activations_manager_read on public.store_module_activations
  for select to authenticated using (beauty_private.can_access_location(location_id));
-- No direct client writes. Server-side owner controls must audit changes.
