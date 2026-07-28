create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists beauty_private;
revoke all on schema beauty_private from public, anon, authenticated;

create type public.organization_status as enum (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED'
);

create type public.location_booking_state as enum (
  'OPEN',
  'PAUSED',
  'CLOSED'
);

create type public.user_role as enum (
  'PLATFORM_ADMIN',
  'ORGANIZATION_OWNER',
  'ORGANIZATION_ADMIN',
  'FINANCE_VIEWER',
  'LOCATION_MANAGER',
  'FRONT_DESK',
  'SERVICE_PROVIDER'
);

create type public.membership_status as enum (
  'INVITED',
  'ACTIVE',
  'DISABLED',
  'REMOVED'
);

create type public.audit_outcome as enum (
  'SUCCESS',
  'DENIED',
  'FAILURE'
);

create type public.merchant_application_status as enum (
  'DRAFT',
  'SUBMITTED',
  'PENDING_REVIEW',
  'NEEDS_INFO',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED'
);

create type public.subscription_status as enum (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED'
);

create type public.invoice_status as enum (
  'DRAFT',
  'ISSUED',
  'PAID',
  'VOID',
  'OVERDUE'
);

create type public.manual_payment_status as enum (
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'REVERSED'
);

create type public.feature_key as enum (
  'ONLINE_BOOKING',
  'BASIC_CALENDAR',
  'STAFF_SCHEDULING',
  'CUSTOMER_CRM',
  'CUSTOMER_MEDIA',
  'BUSINESS_HOURS',
  'RESOURCE_MANAGEMENT',
  'LINE_NOTIFICATIONS',
  'EMAIL_NOTIFICATIONS',
  'DEPOSITS',
  'CANCELLATION_RULES',
  'MULTI_LOCATION',
  'CSV_EXPORT',
  'ADVANCED_REPORTS',
  'SCHEDULED_REPORTS',
  'CUSTOM_BRANDING',
  'AUDIT_VIEWER',
  'API_ACCESS',
  'WEBHOOK_ACCESS',
  'CUSTOM_DOMAIN',
  'WHITE_LABEL',
  'MEMBERSHIPS_PACKAGES',
  'AI_ASSISTANT',
  'MARKETPLACE'
);

create type public.feature_override_type as enum (
  'ALLOW',
  'DENY',
  'LIMIT'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_name text not null check (char_length(business_name) between 1 and 200),
  email text not null,
  phone text not null,
  status public.organization_status not null default 'TRIALING',
  default_timezone text not null default 'Asia/Taipei',
  default_currency text not null default 'TWD',
  default_locale text not null default 'zh-Hant-TW',
  trial_ends_at timestamptz,
  public_profile_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint organizations_currency_format check (default_currency ~ '^[A-Z]{3}$')
);

create unique index organizations_email_lower_uidx
  on public.organizations (lower(email));
create index organizations_status_idx
  on public.organizations (status, created_at desc);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  code text not null check (char_length(code) between 1 and 40),
  description text not null default '',
  address text not null default '',
  phone text not null default '',
  timezone text not null default 'Asia/Taipei',
  currency text not null default 'TWD',
  booking_state public.location_booking_state not null default 'CLOSED',
  online_booking_enabled boolean not null default false,
  is_active boolean not null default true,
  logo_path text,
  cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint locations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint locations_org_slug_unique unique (organization_id, slug),
  constraint locations_org_code_unique unique (organization_id, code),
  constraint locations_org_id_unique unique (organization_id, id)
);

create index locations_org_active_idx
  on public.locations (organization_id, is_active, booking_state);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null,
  password_hash text,
  display_name text not null check (char_length(display_name) between 1 and 160),
  avatar_path text,
  platform_role public.user_role,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_platform_role_check check (
    platform_role is null or platform_role = 'PLATFORM_ADMIN'
  )
);

create unique index profiles_email_lower_uidx on public.profiles (lower(email));
create index profiles_active_idx on public.profiles (is_active, created_at);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  role public.user_role not null,
  status public.membership_status not null default 'INVITED',
  all_locations boolean not null default true,
  is_primary_owner boolean not null default false,
  invited_at timestamptz,
  joined_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_membership_role_check check (
    role in (
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'FINANCE_VIEWER'
    )
  ),
  constraint organization_membership_owner_scope_check check (
    role <> 'ORGANIZATION_OWNER' or all_locations
  ),
  constraint organization_memberships_unique unique (
    organization_id,
    profile_id,
    role
  )
);

create index organization_memberships_profile_active_idx
  on public.organization_memberships (profile_id, status, organization_id);
create index organization_memberships_org_role_idx
  on public.organization_memberships (organization_id, role, status);

create table public.location_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  role public.user_role not null,
  status public.membership_status not null default 'INVITED',
  invited_at timestamptz,
  joined_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_membership_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint location_membership_role_check check (
    role in (
      'ORGANIZATION_ADMIN',
      'FINANCE_VIEWER',
      'LOCATION_MANAGER',
      'FRONT_DESK',
      'SERVICE_PROVIDER'
    )
  ),
  constraint location_memberships_unique unique (
    location_id,
    profile_id,
    role
  )
);

create index location_memberships_profile_active_idx
  on public.location_memberships (profile_id, status, location_id);
create index location_memberships_org_location_role_idx
  on public.location_memberships (
    organization_id,
    location_id,
    role,
    status
  );

create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  csrf_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent_hash text,
  ip_hash text
);

create index auth_sessions_profile_idx
  on public.auth_sessions (profile_id, expires_at desc);
create index auth_sessions_expiry_idx
  on public.auth_sessions (expires_at)
  where revoked_at is null;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  location_id uuid,
  email text not null,
  role public.user_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid not null
    references public.profiles(id) on delete restrict,
  accepted_by uuid
    references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint organization_invitations_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint organization_invitations_role_scope_check check (
    (
      location_id is null
      and role in (
        'ORGANIZATION_OWNER',
        'ORGANIZATION_ADMIN',
        'FINANCE_VIEWER'
      )
    )
    or (
      location_id is not null
      and role in (
        'ORGANIZATION_ADMIN',
        'FINANCE_VIEWER',
        'LOCATION_MANAGER',
        'FRONT_DESK',
        'SERVICE_PROVIDER'
      )
    )
  )
);

create index organization_invitations_org_active_idx
  on public.organization_invitations (organization_id, expires_at)
  where accepted_at is null and revoked_at is null;
create index organization_invitations_email_idx
  on public.organization_invitations (lower(email), expires_at);

create table public.merchant_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  status public.merchant_application_status not null default 'DRAFT',
  business_name text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  industry_type text not null default 'BEAUTY',
  desired_slug text,
  initial_location_name text not null default '',
  initial_location_address text not null default '',
  submitted_at timestamptz,
  review_started_at timestamptz,
  reviewed_at timestamptz,
  reviewer_profile_id uuid
    references public.profiles(id) on delete set null,
  approved_organization_id uuid
    references public.organizations(id) on delete set null,
  applicant_note text,
  internal_note text,
  rejection_reason text,
  expires_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchant_applications_status_idx
  on public.merchant_applications (status, submitted_at, created_at);
create index merchant_applications_applicant_idx
  on public.merchant_applications (applicant_profile_id, created_at desc);

create table public.merchant_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.merchant_applications(id) on delete cascade,
  previous_status public.merchant_application_status,
  new_status public.merchant_application_status not null,
  actor_profile_id uuid
    references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index merchant_application_events_application_idx
  on public.merchant_application_events (application_id, created_at);

create table public.merchant_setup_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  brand_completed_at timestamptz,
  location_completed_at timestamptz,
  business_hours_completed_at timestamptz,
  service_completed_at timestamptz,
  staff_completed_at timestamptz,
  resource_completed_at timestamptz,
  policies_completed_at timestamptz,
  notifications_completed_at timestamptz,
  test_booking_id uuid,
  test_booking_completed_at timestamptz,
  go_live_at timestamptz,
  last_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_setup_progress_test_booking_unique unique (
    organization_id,
    test_booking_id
  )
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_check check (
    code in ('TRIAL', 'LITE', 'STANDARD', 'PRO', 'ENTERPRISE')
  )
);

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null
    references public.plans(id) on delete restrict,
  version integer not null check (version > 0),
  monthly_price_minor integer not null default 0 check (monthly_price_minor >= 0),
  currency text not null default 'TWD',
  trial_days integer not null default 14 check (trial_days between 0 and 365),
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint plan_versions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint plan_versions_unique unique (plan_id, version)
);

create index plan_versions_active_idx
  on public.plan_versions (plan_id, effective_at desc)
  where retired_at is null;

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null
    references public.plan_versions(id) on delete cascade,
  feature_key public.feature_key not null,
  is_enabled boolean not null default false,
  limit_value integer,
  soft_limit boolean not null default false,
  created_at timestamptz not null default now(),
  constraint plan_entitlements_limit_check check (
    limit_value is null or limit_value >= 0
  ),
  constraint plan_entitlements_unique unique (
    plan_version_id,
    feature_key
  )
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  plan_version_id uuid not null
    references public.plan_versions(id) on delete restrict,
  status public.subscription_status not null default 'TRIALING',
  is_current boolean not null default true,
  billing_period_start date not null,
  billing_period_end date not null,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_check check (
    billing_period_end >= billing_period_start
  )
);

create unique index subscriptions_org_current_uidx
  on public.subscriptions (organization_id)
  where is_current;
create index subscriptions_status_idx
  on public.subscriptions (status, billing_period_end);

create table public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.subscriptions(id) on delete cascade,
  item_code text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_minor integer not null default 0 check (unit_price_minor >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_items_unique unique (subscription_id, item_code)
);

create table public.organization_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  feature_key public.feature_key not null,
  override_type public.feature_override_type not null,
  limit_value integer,
  reason text not null,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid
    references public.profiles(id) on delete restrict,
  constraint organization_feature_override_limit_check check (
    (
      override_type = 'LIMIT'
      and limit_value is not null
      and limit_value >= 0
    )
    or (
      override_type <> 'LIMIT'
      and limit_value is null
    )
  ),
  constraint organization_feature_override_window_check check (
    expires_at is null or expires_at > effective_at
  )
);

create index organization_feature_overrides_active_idx
  on public.organization_feature_overrides (
    organization_id,
    feature_key,
    effective_at desc
  )
  where revoked_at is null;

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  location_id uuid,
  event_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  reference_type text,
  reference_id text,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  is_test boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint usage_events_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint usage_events_idempotency_unique unique (
    organization_id,
    event_type,
    idempotency_key
  )
);

create index usage_events_org_period_idx
  on public.usage_events (organization_id, event_type, occurred_at)
  where not is_test;

create table public.billing_usage_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  event_type text not null,
  quantity bigint not null default 0 check (quantity >= 0),
  last_calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_usage_period_check check (period_end >= period_start),
  constraint billing_usage_summaries_unique unique (
    organization_id,
    period_start,
    period_end,
    event_type
  )
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  subscription_id uuid not null
    references public.subscriptions(id) on delete restrict,
  invoice_number text not null unique,
  status public.invoice_status not null default 'DRAFT',
  currency text not null default 'TWD',
  period_start date not null,
  period_end date not null,
  subtotal_minor integer not null default 0 check (subtotal_minor >= 0),
  tax_minor integer not null default 0 check (tax_minor >= 0),
  total_minor integer not null default 0 check (total_minor >= 0),
  amount_paid_minor integer not null default 0 check (amount_paid_minor >= 0),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_period_check check (period_end >= period_start),
  constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_total_check check (
    total_minor = subtotal_minor + tax_minor
    and amount_paid_minor <= total_minor
  ),
  constraint invoices_org_id_unique unique (organization_id, id)
);

create index invoices_org_status_idx
  on public.invoices (organization_id, status, created_at desc);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  item_type text not null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  amount_minor integer not null check (amount_minor >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint invoice_line_items_invoice_fk foreign key (
    organization_id,
    invoice_id
  ) references public.invoices(organization_id, id) on delete cascade,
  constraint invoice_line_items_amount_check check (
    amount_minor = quantity * unit_price_minor
  )
);

create index invoice_line_items_invoice_idx
  on public.invoice_line_items (invoice_id, created_at);

create table public.manual_payment_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  status public.manual_payment_status not null default 'PENDING',
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'TWD',
  reference text,
  note text,
  recorded_by uuid not null
    references public.profiles(id) on delete restrict,
  confirmed_by uuid
    references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_payment_records_invoice_fk foreign key (
    organization_id,
    invoice_id
  ) references public.invoices(organization_id, id) on delete restrict,
  constraint manual_payment_records_currency_check check (
    currency ~ '^[A-Z]{3}$'
  )
);

create index manual_payment_records_invoice_idx
  on public.manual_payment_records (invoice_id, status, created_at desc);

create table public.billing_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  notification_type text not null,
  level text not null default 'INFO',
  title text not null,
  message text not null,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index billing_notifications_org_active_idx
  on public.billing_notifications (organization_id, effective_at desc)
  where acknowledged_at is null;

create table public.rate_limit_buckets (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  identifier_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint rate_limit_buckets_unique unique (
    scope,
    identifier_hash,
    window_start
  )
);

create index rate_limit_buckets_expiry_idx
  on public.rate_limit_buckets (expires_at);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid
    references public.organizations(id) on delete cascade,
  location_id uuid,
  actor_profile_id uuid
    references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  outcome public.audit_outcome not null,
  request_id text not null,
  ip_hash text,
  before_json jsonb,
  after_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade
);

create index audit_logs_org_created_idx
  on public.audit_logs (organization_id, created_at desc);
create index audit_logs_location_created_idx
  on public.audit_logs (location_id, created_at desc);
create index audit_logs_actor_created_idx
  on public.audit_logs (actor_profile_id, created_at desc);

create or replace function beauty_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function beauty_private.protect_last_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
  owner_is_being_removed boolean;
begin
  owner_is_being_removed :=
    old.role = 'ORGANIZATION_OWNER'::public.user_role
    and old.status = 'ACTIVE'::public.membership_status
    and (
      tg_op = 'DELETE'
      or new.role <> 'ORGANIZATION_OWNER'::public.user_role
      or new.status <> 'ACTIVE'::public.membership_status
    );

  if not owner_is_being_removed then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(old.organization_id::text, 0)
  );

  select count(*)
    into remaining_owners
  from public.organization_memberships memberships
  where memberships.organization_id = old.organization_id
    and memberships.role = 'ORGANIZATION_OWNER'::public.user_role
    and memberships.status = 'ACTIVE'::public.membership_status
    and memberships.id <> old.id;

  if remaining_owners = 0 then
    raise exception 'LAST_ORGANIZATION_OWNER'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger organization_memberships_last_owner_before_write
before update or delete on public.organization_memberships
for each row execute function beauty_private.protect_last_organization_owner();

create trigger organizations_updated_at
before update on public.organizations
for each row execute function beauty_private.set_updated_at();
create trigger locations_updated_at
before update on public.locations
for each row execute function beauty_private.set_updated_at();
create trigger profiles_updated_at
before update on public.profiles
for each row execute function beauty_private.set_updated_at();
create trigger organization_memberships_updated_at
before update on public.organization_memberships
for each row execute function beauty_private.set_updated_at();
create trigger location_memberships_updated_at
before update on public.location_memberships
for each row execute function beauty_private.set_updated_at();
create trigger merchant_applications_updated_at
before update on public.merchant_applications
for each row execute function beauty_private.set_updated_at();
create trigger merchant_setup_progress_updated_at
before update on public.merchant_setup_progress
for each row execute function beauty_private.set_updated_at();
create trigger plans_updated_at
before update on public.plans
for each row execute function beauty_private.set_updated_at();
create trigger subscriptions_updated_at
before update on public.subscriptions
for each row execute function beauty_private.set_updated_at();
create trigger subscription_items_updated_at
before update on public.subscription_items
for each row execute function beauty_private.set_updated_at();
create trigger billing_usage_summaries_updated_at
before update on public.billing_usage_summaries
for each row execute function beauty_private.set_updated_at();
create trigger invoices_updated_at
before update on public.invoices
for each row execute function beauty_private.set_updated_at();
create trigger manual_payment_records_updated_at
before update on public.manual_payment_records
for each row execute function beauty_private.set_updated_at();

revoke all on function beauty_private.set_updated_at() from public;
revoke all on function beauty_private.protect_last_organization_owner() from public;
