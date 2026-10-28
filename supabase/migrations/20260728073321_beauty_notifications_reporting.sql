create type public.notification_channel as enum (
  'LINE',
  'EMAIL',
  'SMS'
);

create type public.notification_event_type as enum (
  'BOOKING_CONFIRMED',
  'BOOKING_RESCHEDULED',
  'BOOKING_CANCELLED',
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_3H',
  'BOOKING_PAYMENT_PENDING',
  'BOOKING_PAYMENT_CONFIRMED',
  'BOOKING_COMPLETED',
  'REVIEW_REQUEST',
  'REVISIT_REMINDER',
  'NO_SHOW_NOTICE'
);

create type public.notification_job_status as enum (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELLED'
);

create type public.notification_delivery_status as enum (
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
  'DISABLED'
);

create type public.notification_integration_status as enum (
  'DISABLED',
  'ACTIVE',
  'ERROR'
);

create type public.operational_alert_status as enum (
  'ACTIVE',
  'ACKNOWLEDGED',
  'RESOLVED'
);

create type public.operational_alert_severity as enum (
  'INFO',
  'WARNING',
  'CRITICAL'
);

create type public.report_schedule_type as enum (
  'DAILY_OPERATIONS',
  'WEEKLY_REVENUE',
  'STAFF_UTILIZATION',
  'SERVICE_PERFORMANCE'
);

create table public.notification_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  channel public.notification_channel not null,
  status public.notification_integration_status not null default 'DISABLED',
  secret_reference text,
  sender_reference text,
  configuration jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_integrations_unique unique (
    organization_id,
    channel
  )
);

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  event_type public.notification_event_type not null,
  channel public.notification_channel not null,
  locale text not null default 'zh-Hant-TW',
  subject_template text,
  body_template text not null,
  is_transactional boolean not null default true,
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notification_templates_scope_uidx
  on public.notification_templates (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event_type,
    channel,
    locale,
    version
  );

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid,
  booking_id uuid,
  customer_id uuid,
  event_type public.notification_event_type not null,
  payload jsonb not null,
  idempotency_key text not null,
  available_at timestamptz not null default now(),
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_outbox_organization_fk foreign key (organization_id)
    references public.organizations(id) on delete cascade,
  constraint notification_outbox_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint notification_outbox_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint notification_outbox_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade,
  constraint notification_outbox_unique unique (
    organization_id,
    idempotency_key
  ),
  constraint notification_outbox_org_id_unique unique (organization_id, id)
);

create index notification_outbox_pending_idx
  on public.notification_outbox (available_at, created_at)
  where dispatched_at is null;

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  outbox_id uuid not null,
  channel public.notification_channel not null,
  status public.notification_job_status not null default 'PENDING',
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_jobs_outbox_fk foreign key (
    organization_id,
    outbox_id
  ) references public.notification_outbox(organization_id, id) on delete cascade,
  constraint notification_jobs_unique unique (outbox_id, channel),
  constraint notification_jobs_org_id_unique unique (organization_id, id)
);

create index notification_jobs_runnable_idx
  on public.notification_jobs (status, next_attempt_at, scheduled_at)
  where status in ('PENDING', 'FAILED');

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  notification_job_id uuid not null,
  channel public.notification_channel not null,
  status public.notification_delivery_status not null default 'PENDING',
  attempt_number integer not null check (attempt_number > 0),
  provider_message_id text,
  error_code text,
  response_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_deliveries_job_fk foreign key (
    organization_id,
    notification_job_id
  ) references public.notification_jobs(organization_id, id) on delete cascade,
  constraint notification_deliveries_unique unique (
    notification_job_id,
    attempt_number
  )
);

create index notification_deliveries_org_status_idx
  on public.notification_deliveries (
    organization_id,
    status,
    created_at desc
  );

create table public.line_link_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  token_hash text not null unique,
  status public.public_session_status not null default 'ACTIVE',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint line_link_sessions_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade
);

create index line_link_sessions_active_idx
  on public.line_link_sessions (organization_id, expires_at)
  where status = 'ACTIVE';

create table public.line_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_hash text not null unique,
  organization_id uuid
    references public.organizations(id) on delete cascade,
  event_type text not null,
  event_timestamp timestamptz not null,
  signature_verified boolean not null,
  processed_at timestamptz,
  outcome text,
  error_code text,
  created_at timestamptz not null default now()
);

create index line_webhook_events_timestamp_idx
  on public.line_webhook_events (event_timestamp desc);

create table public.customer_contact_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  channel public.notification_channel not null,
  provider_user_reference text not null,
  provider_user_hash text not null,
  is_active boolean not null default true,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contact_links_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade,
  constraint customer_contact_links_unique unique (
    organization_id,
    channel,
    provider_user_hash
  )
);

create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid,
  event_type text not null,
  target_type text not null,
  target_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_events_organization_fk foreign key (organization_id)
    references public.organizations(id) on delete cascade,
  constraint operational_events_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade
);

create index operational_events_org_created_idx
  on public.operational_events (organization_id, created_at desc);
create index operational_events_location_created_idx
  on public.operational_events (location_id, created_at desc);
create index operational_events_target_idx
  on public.operational_events (target_type, target_id, created_at desc);

create table public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid,
  alert_type text not null,
  severity public.operational_alert_severity not null,
  status public.operational_alert_status not null default 'ACTIVE',
  message text not null,
  target_type text,
  target_id text,
  detected_at timestamptz not null default now(),
  acknowledged_by uuid
    references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid
    references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_alerts_organization_fk foreign key (organization_id)
    references public.organizations(id) on delete cascade,
  constraint operational_alerts_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade
);

create index operational_alerts_active_idx
  on public.operational_alerts (
    organization_id,
    location_id,
    status,
    detected_at desc
  );

create table public.daily_location_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  business_date date not null,
  booking_count integer not null default 0 check (booking_count >= 0),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  new_customer_count integer not null default 0 check (new_customer_count >= 0),
  returning_customer_count integer not null default 0
    check (returning_customer_count >= 0),
  gross_revenue_minor bigint not null default 0
    check (gross_revenue_minor >= 0),
  deposit_collected_minor bigint not null default 0
    check (deposit_collected_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  cancellation_fee_minor bigint not null default 0
    check (cancellation_fee_minor >= 0),
  average_ticket_minor integer not null default 0
    check (average_ticket_minor >= 0),
  available_minutes integer not null default 0 check (available_minutes >= 0),
  service_minutes integer not null default 0 check (service_minutes >= 0),
  last_calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_location_summaries_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint daily_location_summaries_unique unique (
    location_id,
    business_date
  )
);

create index daily_location_summaries_org_date_idx
  on public.daily_location_summaries (
    organization_id,
    business_date desc,
    location_id
  );

create table public.daily_staff_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  staff_profile_id uuid not null,
  business_date date not null,
  booking_count integer not null default 0 check (booking_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  service_minutes integer not null default 0 check (service_minutes >= 0),
  available_minutes integer not null default 0 check (available_minutes >= 0),
  revenue_minor bigint not null default 0 check (revenue_minor >= 0),
  last_calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_staff_summaries_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint daily_staff_summaries_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint daily_staff_summaries_unique unique (
    location_id,
    staff_profile_id,
    business_date
  )
);

create index daily_staff_summaries_org_date_idx
  on public.daily_staff_summaries (
    organization_id,
    business_date desc,
    staff_profile_id
  );

create table public.daily_service_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  service_variant_id uuid not null,
  business_date date not null,
  booking_count integer not null default 0 check (booking_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  service_minutes integer not null default 0 check (service_minutes >= 0),
  revenue_minor bigint not null default 0 check (revenue_minor >= 0),
  last_calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_service_summaries_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint daily_service_summaries_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete restrict,
  constraint daily_service_summaries_unique unique (
    location_id,
    service_variant_id,
    business_date
  )
);

create index daily_service_summaries_org_date_idx
  on public.daily_service_summaries (
    organization_id,
    business_date desc,
    service_variant_id
  );

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null,
  report_type public.report_schedule_type not null,
  location_ids uuid[] not null default '{}',
  recipients text[] not null,
  timezone text not null default 'Asia/Taipei',
  send_hour smallint not null default 8 check (send_hour between 0 and 23),
  send_minute smallint not null default 0 check (send_minute between 0 and 59),
  day_of_week smallint check (day_of_week between 0 and 6),
  is_enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  updated_by uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_schedules_due_idx
  on public.report_schedules (next_run_at)
  where is_enabled and archived_at is null;

create or replace function beauty_private.refresh_daily_location_summary(
  target_organization_id uuid,
  target_location_id uuid,
  target_business_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_timezone text;
  period_start timestamptz;
  period_end timestamptz;
begin
  select timezone
    into location_timezone
  from public.locations
  where organization_id = target_organization_id
    and id = target_location_id;

  if location_timezone is null then
    raise exception 'LOCATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  period_start := target_business_date::timestamp at time zone location_timezone;
  period_end := (target_business_date + 1)::timestamp at time zone location_timezone;

  with booking_rollup as (
    select
      bookings.id,
      bookings.status,
      bookings.total_minor,
      bookings.deposit_required_minor,
      bookings.paid_minor,
      bookings.refunded_minor,
      bookings.cancellation_fee_minor,
      min(segments.starts_at) as scheduled_starts_at,
      sum(segments.duration_minutes)::integer as service_minutes
    from public.bookings bookings
    inner join public.booking_segments segments
      on segments.organization_id = bookings.organization_id
      and segments.location_id = bookings.location_id
      and segments.booking_id = bookings.id
    where bookings.organization_id = target_organization_id
      and bookings.location_id = target_location_id
      and not bookings.is_test
    group by
      bookings.id,
      bookings.status,
      bookings.total_minor,
      bookings.deposit_required_minor,
      bookings.paid_minor,
      bookings.refunded_minor,
      bookings.cancellation_fee_minor
    having min(segments.starts_at) >= period_start
      and min(segments.starts_at) < period_end
  )
  insert into public.daily_location_summaries (
    organization_id,
    location_id,
    business_date,
    booking_count,
    confirmed_count,
    completed_count,
    cancelled_count,
    no_show_count,
    gross_revenue_minor,
    deposit_collected_minor,
    refunded_minor,
    cancellation_fee_minor,
    average_ticket_minor,
    service_minutes,
    last_calculated_at
  )
  select
    target_organization_id,
    target_location_id,
    target_business_date,
    count(booking_rollup.id)::integer,
    count(booking_rollup.id) filter (
      where booking_rollup.status in ('CONFIRMED', 'CHECKED_IN', 'IN_SERVICE')
    )::integer,
    count(booking_rollup.id) filter (
      where booking_rollup.status = 'COMPLETED'
    )::integer,
    count(booking_rollup.id) filter (
      where booking_rollup.status = 'CANCELLED'
    )::integer,
    count(booking_rollup.id) filter (
      where booking_rollup.status = 'NO_SHOW'
    )::integer,
    coalesce(sum(booking_rollup.total_minor) filter (
      where booking_rollup.status = 'COMPLETED'
    ), 0)::bigint,
    coalesce(sum(booking_rollup.deposit_required_minor) filter (
      where booking_rollup.paid_minor > 0
    ), 0)::bigint,
    coalesce(sum(booking_rollup.refunded_minor), 0)::bigint,
    coalesce(sum(booking_rollup.cancellation_fee_minor), 0)::bigint,
    case
      when count(booking_rollup.id) filter (
        where booking_rollup.status = 'COMPLETED'
      ) = 0 then 0
      else (
        coalesce(sum(booking_rollup.total_minor) filter (
          where booking_rollup.status = 'COMPLETED'
        ), 0)
        / count(booking_rollup.id) filter (
          where booking_rollup.status = 'COMPLETED'
        )
      )::integer
    end,
    coalesce(sum(booking_rollup.service_minutes) filter (
      where booking_rollup.status = 'COMPLETED'
    ), 0)::integer,
    now()
  from booking_rollup
  on conflict (location_id, business_date)
  do update set
    booking_count = excluded.booking_count,
    confirmed_count = excluded.confirmed_count,
    completed_count = excluded.completed_count,
    cancelled_count = excluded.cancelled_count,
    no_show_count = excluded.no_show_count,
    gross_revenue_minor = excluded.gross_revenue_minor,
    deposit_collected_minor = excluded.deposit_collected_minor,
    refunded_minor = excluded.refunded_minor,
    cancellation_fee_minor = excluded.cancellation_fee_minor,
    average_ticket_minor = excluded.average_ticket_minor,
    service_minutes = excluded.service_minutes,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = now();
end;
$$;

create trigger notification_integrations_updated_at
before update on public.notification_integrations
for each row execute function beauty_private.set_updated_at();
create trigger notification_templates_updated_at
before update on public.notification_templates
for each row execute function beauty_private.set_updated_at();
create trigger notification_jobs_updated_at
before update on public.notification_jobs
for each row execute function beauty_private.set_updated_at();
create trigger customer_contact_links_updated_at
before update on public.customer_contact_links
for each row execute function beauty_private.set_updated_at();
create trigger operational_alerts_updated_at
before update on public.operational_alerts
for each row execute function beauty_private.set_updated_at();
create trigger daily_location_summaries_updated_at
before update on public.daily_location_summaries
for each row execute function beauty_private.set_updated_at();
create trigger daily_staff_summaries_updated_at
before update on public.daily_staff_summaries
for each row execute function beauty_private.set_updated_at();
create trigger daily_service_summaries_updated_at
before update on public.daily_service_summaries
for each row execute function beauty_private.set_updated_at();
create trigger report_schedules_updated_at
before update on public.report_schedules
for each row execute function beauty_private.set_updated_at();

revoke all on function beauty_private.refresh_daily_location_summary(
  uuid,
  uuid,
  date
) from public, anon, authenticated;
grant execute on function beauty_private.refresh_daily_location_summary(
  uuid,
  uuid,
  date
) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_events'
  ) then
    alter publication supabase_realtime
      add table public.operational_events;
  end if;
end;
$$;
