-- Payroll stays local/test gated. These records are calculations, never payment instructions.
create table public.payroll_rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid,
  profile_id uuid,
  rule_key text not null check (rule_key ~ '^[A-Z0-9_]{3,80}$'),
  version integer not null check (version > 0),
  hourly_rate_minor integer not null default 0 check (hourly_rate_minor >= 0),
  base_per_period_minor integer not null default 0 check (base_per_period_minor >= 0),
  overtime_multiplier_bps integer not null default 15000
    check (overtime_multiplier_bps between 10000 and 30000),
  approved_overtime_only boolean not null default true,
  effective_from date not null,
  effective_until date not null,
  published_at timestamptz,
  published_by_profile_id uuid references public.profiles(id),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint payroll_rule_versions_date_check check (effective_until > effective_from),
  constraint payroll_rule_versions_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint payroll_rule_versions_unique unique (organization_id, rule_key, version)
);

create table public.payroll_leave_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  paid boolean not null,
  reason text not null,
  approved_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint payroll_leave_approvals_time_check check (ends_at > starts_at),
  constraint payroll_leave_approvals_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id)
);

create table public.payroll_overtime_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clock_in_event_id uuid not null references public.staff_attendance_events(id),
  approved_minutes integer not null check (approved_minutes > 0),
  reason text not null check (length(btrim(reason)) > 0),
  approved_by_profile_id uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  constraint payroll_overtime_approvals_unique unique (clock_in_event_id)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null references public.profiles(id),
  period_from date not null,
  period_until date not null,
  revision integer not null check (revision > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED')),
  source_hash text not null check (length(source_hash) = 64),
  rule_id uuid not null references public.payroll_rule_versions(id),
  total_minor bigint not null,
  created_by_profile_id uuid not null references public.profiles(id),
  approved_by_profile_id uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payroll_periods_date_check check (period_until > period_from),
  constraint payroll_periods_location_fk foreign key (organization_id, location_id)
    references public.locations(organization_id, id),
  constraint payroll_periods_revision_unique
    unique (organization_id, location_id, profile_id, period_from, period_until, revision)
);
create unique index payroll_periods_one_approved
  on public.payroll_periods (organization_id, location_id, profile_id, period_from, period_until)
  where status = 'APPROVED';

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id),
  kind text not null check (kind in
    ('BASE','HOURLY','OVERTIME','PAID_LEAVE','COMMISSION','REVIEW_TIME','ADJUSTMENT')),
  source_ref text not null,
  amount_minor bigint not null,
  minutes integer,
  rule_version integer not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint payroll_lines_source_unique unique (period_id, kind, source_ref)
);

create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  original_period_id uuid not null references public.payroll_periods(id),
  booking_refund_id uuid not null references public.booking_refunds(id),
  applies_on date not null,
  amount_minor bigint not null check (amount_minor < 0),
  idempotency_hash text not null check (length(idempotency_hash) = 64),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint payroll_adjustments_refund_unique unique (original_period_id, booking_refund_id),
  constraint payroll_adjustments_idempotency_unique unique (organization_id, profile_id, idempotency_hash)
);

create function beauty_private.protect_payroll_period() returns trigger language plpgsql as $$
begin
  if old.status = 'APPROVED' then raise exception 'Approved payroll period is immutable'; end if;
  if new.status <> 'APPROVED' or new.id <> old.id or new.total_minor <> old.total_minor
     or new.source_hash <> old.source_hash then
    raise exception 'Only draft approval is allowed';
  end if;
  return new;
end $$;
create trigger payroll_periods_approval_only before update on public.payroll_periods
  for each row execute function beauty_private.protect_payroll_period();
create function beauty_private.protect_payroll_lines() returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Payroll lines are append-only'; end if;
  if (select status from public.payroll_periods where id = new.period_id) <> 'DRAFT' then
    raise exception 'Approved payroll lines are locked';
  end if;
  return new;
end $$;
create trigger payroll_lines_protected before insert or update or delete on public.payroll_lines
  for each row execute function beauty_private.protect_payroll_lines();

alter table public.payroll_rule_versions enable row level security;
alter table public.payroll_leave_approvals enable row level security;
alter table public.payroll_overtime_approvals enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payroll_adjustments enable row level security;
-- No direct client policies; only owner/payroll and own-payslip server reads.
