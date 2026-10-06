create table public.customer_status_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid,
  customer_id uuid not null,
  status_kind text not null check (status_kind in ('BLACKLIST', 'VIP')),
  effective_from timestamptz not null default now(),
  expires_at timestamptz,
  review_at timestamptz,
  resolved_at timestamptz,
  reason text not null check (length(btrim(reason)) > 0),
  actor_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint customer_status_rules_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id),
  constraint customer_status_rules_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint customer_status_rules_time_check
    check (expires_at is null or expires_at > effective_from)
);
create index customer_status_rules_active_idx
  on public.customer_status_rules
    (organization_id, customer_id, status_kind, location_id, effective_from, expires_at)
  where resolved_at is null;

create table public.customer_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status_rule_id uuid references public.customer_status_rules(id),
  customer_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id),
  action text not null check (action in ('SET', 'CLEARED', 'APPEALED')),
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint customer_status_events_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
);
alter table public.customer_status_rules enable row level security;
alter table public.customer_status_events enable row level security;
-- No client RLS policy: reasons are available only through capability-checked server APIs.
