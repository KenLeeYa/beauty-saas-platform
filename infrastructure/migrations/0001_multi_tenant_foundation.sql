create extension if not exists "pgcrypto";

create type tenant_status as enum ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
create type industry_type as enum ('BEAUTY', 'BODY_CARE', 'EYELASH', 'NAIL', 'MASSAGE', 'HAIR', 'SPA', 'OTHER');
create type membership_status as enum ('INVITED', 'ACTIVE', 'DISABLED', 'REMOVED');
create type platform_user_status as enum ('ACTIVE', 'DISABLED');
create type audit_actor_type as enum ('USER', 'PLATFORM_SUPPORT', 'SYSTEM');
create type appointment_status as enum ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
create type job_status as enum ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name varchar(160) not null,
  slug varchar(80) not null unique,
  industry_type industry_type not null,
  status tenant_status not null default 'TRIAL',
  timezone varchar(80) not null default 'Asia/Taipei',
  default_locale varchar(20) not null default 'zh-TW',
  subscription_plan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suspended_at timestamptz
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name varchar(160) not null,
  code varchar(40) not null,
  phone varchar(40),
  address text,
  timezone varchar(80) not null default 'Asia/Taipei',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  google_sub varchar(255) unique,
  email varchar(255) not null unique,
  display_name varchar(160) not null,
  avatar_url text,
  platform_status platform_user_status not null default 'ACTIVE',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  provider varchar(60) not null,
  provider_subject varchar(255) not null,
  email varchar(255) not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  key varchar(80) not null,
  name varchar(120) not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key varchar(120) not null unique,
  description text
);

create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id),
  permission_id uuid not null references permissions(id),
  unique (role_id, permission_id)
);

create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  status membership_status not null default 'INVITED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invited_at timestamptz,
  joined_at timestamptz,
  unique (tenant_id, user_id)
);

create table branch_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  tenant_membership_id uuid not null references tenant_memberships(id),
  branch_id uuid not null references branches(id),
  created_at timestamptz not null default now(),
  unique (tenant_membership_id, branch_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash varchar(255) not null unique,
  active_tenant_id uuid references tenants(id),
  active_branch_id uuid references branches(id),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  ip_address varchar(80),
  user_agent text,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  display_name varchar(160) not null,
  phone varchar(40),
  email varchar(255),
  birthday date,
  gender varchar(40),
  status varchar(40) not null default 'ACTIVE',
  source varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null references branches(id),
  customer_id uuid not null references customers(id),
  primary_staff_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status appointment_status not null default 'PENDING',
  source varchar(80) not null default 'MANUAL',
  notes text,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references users(id),
  cancellation_reason text
);

create table appointment_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  appointment_id uuid not null references appointments(id),
  service_id uuid not null,
  staff_id uuid,
  duration_minutes integer not null,
  unit_price integer not null,
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table stored_objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  branch_id uuid references branches(id),
  bucket varchar(120) not null,
  object_key text not null,
  original_filename text,
  mime_type varchar(160) not null,
  size_bytes integer not null,
  checksum varchar(255),
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table background_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  job_type varchar(80) not null,
  payload_json jsonb not null default '{}'::jsonb,
  status job_status not null default 'PENDING',
  priority integer not null default 100,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by varchar(120),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  branch_id uuid references branches(id),
  actor_user_id uuid references users(id),
  actor_type audit_actor_type not null,
  action varchar(120) not null,
  entity_type varchar(120) not null,
  entity_id varchar(120),
  old_data jsonb,
  new_data jsonb,
  request_id varchar(120) not null,
  ip_address varchar(80),
  user_agent text,
  created_at timestamptz not null default now()
);

create index appointments_tenant_branch_start_idx on appointments(tenant_id, branch_id, start_at);
create index appointments_tenant_staff_range_idx on appointments(tenant_id, primary_staff_id, start_at, end_at);
create index customers_tenant_phone_idx on customers(tenant_id, phone);
create index tenant_memberships_tenant_user_idx on tenant_memberships(tenant_id, user_id);
create index branch_memberships_membership_branch_idx on branch_memberships(tenant_membership_id, branch_id);
create index audit_logs_tenant_created_idx on audit_logs(tenant_id, created_at);
create index background_jobs_runnable_idx on background_jobs(status, run_at, priority);

alter table branches enable row level security;
alter table tenant_memberships enable row level security;
alter table branch_memberships enable row level security;
alter table customers enable row level security;
alter table appointments enable row level security;
alter table appointment_services enable row level security;
alter table stored_objects enable row level security;
alter table background_jobs enable row level security;
alter table audit_logs enable row level security;

create policy tenant_isolation_branches on branches
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_tenant_memberships on tenant_memberships
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_branch_memberships on branch_memberships
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_customers on customers
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_appointments on appointments
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_appointment_services on appointment_services
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_stored_objects on stored_objects
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_background_jobs on background_jobs
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
create policy tenant_isolation_audit_logs on audit_logs
  using (tenant_id::text = current_setting('app.current_tenant_id', true));
