create table public.commission_rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid,
  service_variant_id uuid,
  staff_profile_id uuid,
  rule_key text not null check (rule_key ~ '^[A-Z0-9_]{3,80}$'),
  version integer not null check (version > 0),
  priority integer not null,
  basis text not null check (basis in ('ORIGINAL', 'DISCOUNTED', 'PAID_COMPONENT', 'FIXED')),
  rate_bps integer check (rate_bps between 0 and 10000),
  fixed_minor integer check (fixed_minor >= 0),
  exclude_fee_tax boolean not null default false,
  effective_from timestamptz not null,
  effective_until timestamptz not null,
  published_at timestamptz,
  published_by_profile_id uuid references public.profiles(id),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint commission_rule_versions_amount_check check (
    (basis = 'FIXED' and fixed_minor is not null and rate_bps is null)
    or (basis <> 'FIXED' and rate_bps is not null and fixed_minor is null)),
  constraint commission_rule_versions_time_check check (effective_until > effective_from),
  constraint commission_rule_versions_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint commission_rule_versions_variant_fk foreign key (organization_id, service_variant_id)
    references public.service_variants(organization_id, id),
  constraint commission_rule_versions_staff_fk foreign key (organization_id, staff_profile_id)
    references public.staff_profiles(organization_id, id),
  constraint commission_rule_versions_unique unique (organization_id, rule_key, version)
);
create index commission_rule_versions_lookup_idx on public.commission_rule_versions
  (organization_id, location_id, service_variant_id, staff_profile_id,
   effective_from, effective_until, priority)
  where published_at is not null;

create function beauty_private.prevent_published_commission_edit() returns trigger
language plpgsql as $$
begin
  if old.published_at is not null then
    raise exception 'Published commission terms are immutable';
  end if;
  return new;
end $$;
create trigger commission_rule_versions_immutable before update on public.commission_rule_versions
  for each row execute function beauty_private.prevent_published_commission_edit();

alter table public.commission_rule_versions enable row level security;
-- Rules and quotes are handled by capability-checked server paths only.
