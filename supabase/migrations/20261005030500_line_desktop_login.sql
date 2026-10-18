-- A backoffice LINE login must be tied to an approved employee link.
alter table public.line_oauth_states
  drop constraint line_oauth_states_intent_check;
alter table public.line_oauth_states
  add constraint line_oauth_states_intent_check
  check (intent in ('CUSTOMER_LOGIN', 'EMPLOYEE_LINK', 'EMPLOYEE_LOGIN'));
alter table public.line_oauth_states
  drop constraint if exists line_oauth_states_intent_profile_check;
alter table public.line_oauth_states
  add constraint line_oauth_states_intent_profile_check check (
    (intent in ('CUSTOMER_LOGIN', 'EMPLOYEE_LOGIN') and requested_profile_id is null)
    or (intent = 'EMPLOYEE_LINK' and requested_profile_id is not null)
  );

create table public.line_desktop_sessions (
  auth_session_id uuid primary key references public.auth_sessions(id) on delete cascade,
  identity_link_id uuid not null references public.line_identity_links(id),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  constraint line_desktop_sessions_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id)
);
create index line_desktop_sessions_link_idx
  on public.line_desktop_sessions(identity_link_id);
alter table public.line_desktop_sessions enable row level security;
