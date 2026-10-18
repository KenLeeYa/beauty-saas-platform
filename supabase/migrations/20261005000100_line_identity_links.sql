-- Verified LINE subjects are scoped to a provider and organization.
-- Raw LINE user IDs, OAuth tokens and client secrets are never stored here.
create table public.line_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_id text not null check (length(btrim(provider_id)) > 0),
  subject_hash text not null check (length(subject_hash) = 64),
  actor_kind text not null check (actor_kind in ('CUSTOMER', 'EMPLOYEE')),
  customer_id uuid,
  profile_id uuid references public.profiles(id),
  approved_by_profile_id uuid references public.profiles(id),
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint line_identity_links_target_check check (
    (actor_kind = 'CUSTOMER' and customer_id is not null and profile_id is null)
    or (actor_kind = 'EMPLOYEE' and profile_id is not null and customer_id is null)
  ),
  constraint line_identity_links_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id),
  constraint line_identity_links_employee_approval_check check (
    actor_kind <> 'EMPLOYEE' or revoked_at is not null
    or (approved_by_profile_id is not null and approved_at is not null)
  )
);

create unique index line_identity_links_active_subject
  on public.line_identity_links (organization_id, provider_id, subject_hash, actor_kind)
  where revoked_at is null;

create table public.line_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  channel_id text not null,
  intent text not null default 'CUSTOMER_LOGIN'
    check (intent in ('CUSTOMER_LOGIN', 'EMPLOYEE_LINK')),
  requested_profile_id uuid references public.profiles(id),
  state_hash text not null unique check (length(state_hash) = 64),
  nonce_hash text not null check (length(nonce_hash) = 64),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint line_oauth_states_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade,
  constraint line_oauth_states_intent_profile_check check (
    (intent = 'CUSTOMER_LOGIN' and requested_profile_id is null)
    or (intent = 'EMPLOYEE_LINK' and requested_profile_id is not null)
  )
);

create table public.line_employee_link_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null references public.profiles(id),
  provider_id text not null,
  subject_hash text not null check (length(subject_hash) = 64),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reviewed_by_profile_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_reason text not null default '',
  created_at timestamptz not null default now(),
  constraint line_employee_link_requests_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade
);

create unique index line_employee_link_requests_pending_unique
  on public.line_employee_link_requests
    (organization_id, provider_id, subject_hash, profile_id)
  where status = 'PENDING';

create table public.line_mobile_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  identity_link_id uuid not null references public.line_identity_links(id),
  public_booking_session_id uuid not null unique references public.public_booking_sessions(id),
  token_hash text not null unique check (length(token_hash) = 64),
  device_hash text not null check (length(device_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint line_mobile_sessions_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete cascade
);

create index line_mobile_sessions_active_link on public.line_mobile_sessions (identity_link_id, expires_at)
  where revoked_at is null;

create table public.line_identity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  identity_link_id uuid references public.line_identity_links(id),
  mobile_session_id uuid references public.line_mobile_sessions(id),
  actor_profile_id uuid references public.profiles(id),
  event_type text not null check (event_type in ('LINKED', 'APPROVED', 'REVOKED', 'SESSION_CREATED', 'SESSION_REVOKED')),
  reason text not null default '',
  occurred_at timestamptz not null default now()
);

alter table public.line_identity_links enable row level security;
alter table public.line_oauth_states enable row level security;
alter table public.line_employee_link_requests enable row level security;
alter table public.line_mobile_sessions enable row level security;
alter table public.line_identity_events enable row level security;

create policy line_identity_links_manager_read on public.line_identity_links
  for select to authenticated using (beauty_private.can_access_organization(organization_id));
create policy line_identity_events_manager_read on public.line_identity_events
  for select to authenticated using (beauty_private.can_access_organization(organization_id));
create policy line_employee_link_requests_manager_read on public.line_employee_link_requests
  for select to authenticated using (beauty_private.can_access_location(location_id));
-- Session and OAuth state rows have no client policies. Mutations go through audited server functions.
