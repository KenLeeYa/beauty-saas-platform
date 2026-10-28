create table public.member_promotion_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid,
  service_variant_id uuid,
  policy_key text not null check (policy_key ~ '^[A-Z0-9_]{3,80}$'),
  version integer not null check (version > 0),
  kind text not null check (kind in ('SEASONAL', 'MOTHERS_DAY', 'BIRTHDAY', 'VIP')),
  priority integer not null,
  discount_percent integer not null check (discount_percent between 1 and 100),
  max_discount_minor integer check (max_discount_minor is null or max_discount_minor >= 0),
  effective_from timestamptz not null,
  effective_until timestamptz not null,
  attestation_required boolean not null default false,
  published_at timestamptz,
  published_by_profile_id uuid references public.profiles(id),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint member_promotion_policies_time_check check (effective_until > effective_from),
  constraint member_promotion_policies_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint member_promotion_policies_variant_fk foreign key (organization_id, service_variant_id)
    references public.service_variants(organization_id, id),
  constraint member_promotion_policies_version_unique unique (organization_id, policy_key, version)
);
create index member_promotion_policies_lookup_idx
  on public.member_promotion_policies
    (organization_id, location_id, service_variant_id, effective_from, effective_until, priority)
  where published_at is not null;

create table public.member_promotion_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  policy_id uuid not null references public.member_promotion_policies(id),
  customer_id uuid not null,
  booking_id uuid not null,
  benefit_year integer not null,
  created_at timestamptz not null default now(),
  constraint member_promotion_usage_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id),
  constraint member_promotion_usage_booking_fk foreign key (organization_id, booking_id)
    references public.bookings(organization_id, id),
  constraint member_promotion_usage_once_unique unique (policy_id, customer_id, benefit_year)
);

create function beauty_private.prevent_published_promotion_edit() returns trigger
language plpgsql as $$
begin
  if old.published_at is not null then
    raise exception 'Published promotion terms are immutable';
  end if;
  return new;
end $$;
create trigger member_promotion_policies_immutable before update on public.member_promotion_policies
  for each row execute function beauty_private.prevent_published_promotion_edit();

alter table public.member_promotion_policies enable row level security;
alter table public.member_promotion_usage enable row level security;
-- Server-only access: member eligibility and usage can reveal sensitive CRM facts.
