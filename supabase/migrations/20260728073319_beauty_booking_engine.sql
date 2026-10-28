create type public.booking_status as enum (
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_SERVICE',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
  'EXPIRED',
  'RESCHEDULED'
);

create type public.booking_payment_status as enum (
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED'
);

create type public.booking_source as enum (
  'ONLINE',
  'PHONE',
  'LINE',
  'WALK_IN',
  'STAFF',
  'OWNER',
  'IMPORT',
  'OTHER'
);

create type public.booking_hold_status as enum (
  'ACTIVE',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED'
);

create type public.public_session_status as enum (
  'ACTIVE',
  'CONSUMED',
  'EXPIRED',
  'REVOKED'
);

create type public.public_attempt_outcome as enum (
  'ALLOWED',
  'DENIED',
  'ERROR'
);

create type public.booking_payment_method as enum (
  'CASH',
  'MANUAL_TRANSFER',
  'LINE_PAY_MANUAL',
  'OTHER'
);

create type public.booking_payment_attempt_status as enum (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

create type public.booking_refund_status as enum (
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'FAILED'
);

create type public.deposit_mode as enum (
  'NONE',
  'FIXED',
  'PERCENTAGE'
);

create type public.cancellation_fee_mode as enum (
  'NONE',
  'FIXED',
  'PERCENTAGE',
  'DEPOSIT_FORFEIT'
);

create table public.deposit_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  service_variant_id uuid,
  name text not null,
  mode public.deposit_mode not null default 'NONE',
  fixed_amount_minor integer,
  percentage numeric(5, 2),
  payment_window_minutes integer not null default 15
    check (payment_window_minutes between 1 and 1440),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_policies_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint deposit_policies_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete cascade,
  constraint deposit_policies_value_check check (
    (mode = 'NONE' and fixed_amount_minor is null and percentage is null)
    or (
      mode = 'FIXED'
      and fixed_amount_minor is not null
      and fixed_amount_minor >= 0
      and percentage is null
    )
    or (
      mode = 'PERCENTAGE'
      and fixed_amount_minor is null
      and percentage between 0 and 100
    )
  )
);

create unique index deposit_policies_active_scope_uidx
  on public.deposit_policies (
    location_id,
    coalesce(service_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create table public.cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  service_variant_id uuid,
  name text not null,
  free_cancellation_hours integer not null default 24
    check (free_cancellation_hours between 0 and 8760),
  late_fee_mode public.cancellation_fee_mode not null default 'NONE',
  late_fee_fixed_minor integer,
  late_fee_percentage numeric(5, 2),
  no_show_fee_mode public.cancellation_fee_mode not null default 'NONE',
  no_show_fee_fixed_minor integer,
  no_show_fee_percentage numeric(5, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancellation_policies_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint cancellation_policies_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete cascade,
  constraint cancellation_policies_late_fee_check check (
    (late_fee_mode = 'NONE' and late_fee_fixed_minor is null and late_fee_percentage is null)
    or (
      late_fee_mode = 'FIXED'
      and late_fee_fixed_minor is not null
      and late_fee_fixed_minor >= 0
      and late_fee_percentage is null
    )
    or (
      late_fee_mode = 'PERCENTAGE'
      and late_fee_fixed_minor is null
      and late_fee_percentage between 0 and 100
    )
    or (
      late_fee_mode = 'DEPOSIT_FORFEIT'
      and late_fee_fixed_minor is null
      and late_fee_percentage is null
    )
  ),
  constraint cancellation_policies_no_show_fee_check check (
    (no_show_fee_mode = 'NONE' and no_show_fee_fixed_minor is null and no_show_fee_percentage is null)
    or (
      no_show_fee_mode = 'FIXED'
      and no_show_fee_fixed_minor is not null
      and no_show_fee_fixed_minor >= 0
      and no_show_fee_percentage is null
    )
    or (
      no_show_fee_mode = 'PERCENTAGE'
      and no_show_fee_fixed_minor is null
      and no_show_fee_percentage between 0 and 100
    )
    or (
      no_show_fee_mode = 'DEPOSIT_FORFEIT'
      and no_show_fee_fixed_minor is null
      and no_show_fee_percentage is null
    )
  )
);

create unique index cancellation_policies_active_scope_uidx
  on public.cancellation_policies (
    location_id,
    coalesce(service_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create table public.location_booking_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null unique,
  slot_interval_minutes integer not null default 15
    check (slot_interval_minutes in (5, 10, 15, 20, 30, 60)),
  minimum_lead_minutes integer not null default 60
    check (minimum_lead_minutes between 0 and 525600),
  maximum_advance_days integer not null default 60
    check (maximum_advance_days between 1 and 730),
  hold_minutes integer not null default 10
    check (hold_minutes between 1 and 60),
  customer_cancellation_enabled boolean not null default true,
  customer_reschedule_enabled boolean not null default true,
  cancellation_cutoff_hours integer not null default 24
    check (cancellation_cutoff_hours between 0 and 8760),
  reminder_hours integer[] not null default '{24,3}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_booking_policies_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint location_booking_policies_org_location_unique unique (
    organization_id,
    location_id
  )
);

create table public.public_booking_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  token_hash text not null unique,
  status public.public_session_status not null default 'ACTIVE',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  ip_hash text,
  device_hash text,
  behavior_hash text,
  allowed_origin text not null,
  created_at timestamptz not null default now(),
  constraint public_booking_sessions_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint public_booking_sessions_org_id_unique unique (
    organization_id,
    id
  )
);

create index public_booking_sessions_active_idx
  on public.public_booking_sessions (
    organization_id,
    location_id,
    expires_at
  )
  where status = 'ACTIVE';

create table public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  public_booking_session_id uuid not null,
  service_variant_id uuid not null,
  staff_profile_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_hold_status not null default 'ACTIVE',
  token_hash text not null unique,
  idempotency_key_hash text not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_holds_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint booking_holds_session_fk foreign key (
    organization_id,
    public_booking_session_id
  ) references public.public_booking_sessions(organization_id, id) on delete cascade,
  constraint booking_holds_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete restrict,
  constraint booking_holds_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete restrict,
  constraint booking_holds_range_check check (ends_at > starts_at),
  constraint booking_holds_expiry_check check (expires_at > created_at),
  constraint booking_holds_idempotency_unique unique (
    public_booking_session_id,
    idempotency_key_hash
  ),
  constraint booking_holds_org_id_unique unique (organization_id, id)
);

create index booking_holds_active_lookup_idx
  on public.booking_holds (
    organization_id,
    location_id,
    starts_at,
    expires_at
  )
  where status = 'ACTIVE';

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  customer_id uuid not null,
  source public.booking_source not null default 'ONLINE',
  status public.booking_status not null,
  payment_status public.booking_payment_status not null default 'UNPAID',
  subtotal_minor integer not null check (subtotal_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  total_minor integer not null check (total_minor >= 0),
  deposit_required_minor integer not null default 0
    check (deposit_required_minor >= 0),
  paid_minor integer not null default 0 check (paid_minor >= 0),
  refunded_minor integer not null default 0 check (refunded_minor >= 0),
  cancellation_fee_minor integer not null default 0
    check (cancellation_fee_minor >= 0),
  currency text not null default 'TWD',
  policy_snapshot jsonb not null default '{}'::jsonb,
  cancellation_calculation jsonb,
  public_note text,
  internal_note text,
  tracking_token_hash text not null unique,
  version integer not null default 1 check (version > 0),
  is_test boolean not null default false,
  rescheduled_from_booking_id uuid,
  rescheduled_to_booking_id uuid,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  service_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  created_by uuid
    references public.profiles(id) on delete set null,
  updated_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict,
  constraint bookings_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete restrict,
  constraint bookings_amount_check check (
    subtotal_minor >= discount_minor
    and total_minor = subtotal_minor - discount_minor
    and paid_minor <= total_minor
    and refunded_minor <= paid_minor
    and deposit_required_minor <= total_minor
  ),
  constraint bookings_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint bookings_reschedule_distinct_check check (
    rescheduled_from_booking_id is null
    or rescheduled_from_booking_id <> id
  ),
  constraint bookings_org_id_unique unique (organization_id, id)
);

alter table public.bookings
  add constraint bookings_rescheduled_from_fk foreign key (
    organization_id,
    rescheduled_from_booking_id
  ) references public.bookings(organization_id, id) on delete restrict,
  add constraint bookings_rescheduled_to_fk foreign key (
    organization_id,
    rescheduled_to_booking_id
  ) references public.bookings(organization_id, id) on delete restrict;

create index bookings_location_calendar_idx
  on public.bookings (
    organization_id,
    location_id,
    status,
    created_at desc
  );
create index bookings_customer_history_idx
  on public.bookings (organization_id, customer_id, created_at desc);
create index bookings_payment_status_idx
  on public.bookings (organization_id, payment_status, created_at desc);

create table public.booking_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid not null,
  service_id uuid,
  service_variant_id uuid,
  assigned_staff_id uuid,
  service_name_snapshot text not null,
  variant_name_snapshot text not null,
  staff_name_snapshot text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  pre_buffer_minutes integer not null default 0
    check (pre_buffer_minutes between 0 and 240),
  post_buffer_minutes integer not null default 0
    check (post_buffer_minutes between 0 and 240),
  price_minor integer not null check (price_minor >= 0),
  sort_order integer not null default 0,
  resource_requirements_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_segments_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint booking_segments_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict,
  constraint booking_segments_service_fk foreign key (
    organization_id,
    service_id
  ) references public.services(organization_id, id) on delete restrict,
  constraint booking_segments_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete restrict,
  constraint booking_segments_staff_fk foreign key (
    organization_id,
    assigned_staff_id
  ) references public.staff_profiles(organization_id, id) on delete restrict,
  constraint booking_segments_range_check check (ends_at > starts_at),
  constraint booking_segments_duration_check check (
    extract(epoch from (ends_at - starts_at)) / 60 = duration_minutes
  ),
  constraint booking_segments_booking_sort_unique unique (
    booking_id,
    sort_order
  ),
  constraint booking_segments_org_id_unique unique (organization_id, id)
);

create index booking_segments_calendar_idx
  on public.booking_segments (
    organization_id,
    location_id,
    starts_at,
    ends_at
  );
create index booking_segments_staff_idx
  on public.booking_segments (
    organization_id,
    assigned_staff_id,
    starts_at
  );

create table public.booking_staff_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid,
  booking_hold_id uuid,
  booking_segment_id uuid,
  staff_profile_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_blocking boolean not null default true,
  time_range tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_staff_allocations_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict,
  constraint booking_staff_allocations_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint booking_staff_allocations_hold_fk foreign key (
    organization_id,
    booking_hold_id
  ) references public.booking_holds(organization_id, id) on delete cascade,
  constraint booking_staff_allocations_segment_fk foreign key (
    organization_id,
    booking_segment_id
  ) references public.booking_segments(organization_id, id) on delete cascade,
  constraint booking_staff_allocations_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete restrict,
  constraint booking_staff_allocations_owner_check check (
    (booking_id is not null)::integer
    + (booking_hold_id is not null)::integer = 1
  ),
  constraint booking_staff_allocations_segment_check check (
    booking_id is not null or booking_segment_id is null
  ),
  constraint booking_staff_allocations_range_check check (ends_at > starts_at)
);

alter table public.booking_staff_allocations
  add constraint booking_staff_allocations_no_overlap
  exclude using gist (
    staff_profile_id with =,
    time_range with &&
  )
  where (is_blocking);

create index booking_staff_allocations_lookup_idx
  on public.booking_staff_allocations (
    organization_id,
    location_id,
    staff_profile_id,
    starts_at
  )
  where is_blocking;

create table public.booking_resource_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid,
  booking_hold_id uuid,
  booking_segment_id uuid,
  resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_blocking boolean not null default true,
  time_range tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_resource_allocations_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict,
  constraint booking_resource_allocations_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint booking_resource_allocations_hold_fk foreign key (
    organization_id,
    booking_hold_id
  ) references public.booking_holds(organization_id, id) on delete cascade,
  constraint booking_resource_allocations_segment_fk foreign key (
    organization_id,
    booking_segment_id
  ) references public.booking_segments(organization_id, id) on delete cascade,
  constraint booking_resource_allocations_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.resources(organization_id, id) on delete restrict,
  constraint booking_resource_allocations_owner_check check (
    (booking_id is not null)::integer
    + (booking_hold_id is not null)::integer = 1
  ),
  constraint booking_resource_allocations_segment_check check (
    booking_id is not null or booking_segment_id is null
  ),
  constraint booking_resource_allocations_range_check check (ends_at > starts_at)
);

alter table public.booking_resource_allocations
  add constraint booking_resource_allocations_no_overlap
  exclude using gist (
    resource_id with =,
    time_range with &&
  )
  where (is_blocking);

create index booking_resource_allocations_lookup_idx
  on public.booking_resource_allocations (
    organization_id,
    location_id,
    resource_id,
    starts_at
  )
  where is_blocking;

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid not null,
  event_type text not null,
  previous_status public.booking_status,
  new_status public.booking_status,
  actor_profile_id uuid
    references public.profiles(id) on delete set null,
  public_actor boolean not null default false,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint booking_events_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint booking_events_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict
);

create index booking_events_booking_idx
  on public.booking_events (booking_id, created_at);
create index booking_events_location_idx
  on public.booking_events (
    organization_id,
    location_id,
    created_at desc
  );

create table public.booking_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  booking_id uuid not null,
  token_hash text not null unique,
  purpose text not null default 'MANAGE',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_access_tokens_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade
);

create index booking_access_tokens_active_idx
  on public.booking_access_tokens (booking_id, expires_at)
  where revoked_at is null;

create table public.public_booking_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  location_id uuid,
  public_booking_session_id uuid,
  request_id text not null,
  event_type text not null,
  outcome public.public_attempt_outcome not null,
  reason_code text not null,
  ip_hash text,
  device_hash text,
  behavior_hash text,
  session_token_hash text,
  idempotency_hash text,
  created_at timestamptz not null default now(),
  constraint public_booking_attempts_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete set null,
  constraint public_booking_attempts_session_fk foreign key (
    organization_id,
    public_booking_session_id
  ) references public.public_booking_sessions(organization_id, id) on delete set null
);

create index public_booking_attempts_ip_idx
  on public.public_booking_attempts (ip_hash, created_at desc);
create index public_booking_attempts_device_idx
  on public.public_booking_attempts (device_hash, created_at desc);
create index public_booking_attempts_location_idx
  on public.public_booking_attempts (
    organization_id,
    location_id,
    created_at desc
  );

create table public.public_rate_limit_buckets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  location_id uuid,
  dimension_type text not null,
  dimension_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint public_rate_limit_buckets_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint public_rate_limit_buckets_unique unique (
    location_id,
    dimension_type,
    dimension_hash,
    window_start
  )
);

create index public_rate_limit_buckets_expiry_idx
  on public.public_rate_limit_buckets (expires_at);
create index public_rate_limit_buckets_global_idx
  on public.public_rate_limit_buckets (
    dimension_type,
    dimension_hash,
    window_start
  )
  where location_id is null;

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid not null,
  method public.booking_payment_method not null,
  status public.booking_payment_status not null default 'UNPAID',
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'TWD',
  reference text,
  note text,
  recorded_by uuid
    references public.profiles(id) on delete set null,
  confirmed_by uuid
    references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_payments_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete restrict,
  constraint booking_payments_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict,
  constraint booking_payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint booking_payments_org_id_unique unique (organization_id, id)
);

create index booking_payments_booking_idx
  on public.booking_payments (booking_id, status, created_at desc);
create index booking_payments_org_status_idx
  on public.booking_payments (
    organization_id,
    location_id,
    status,
    created_at desc
  );

create table public.booking_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  booking_id uuid not null,
  booking_payment_id uuid,
  provider text not null,
  status public.booking_payment_attempt_status not null default 'PENDING',
  idempotency_key_hash text not null,
  provider_reference text,
  error_code text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint booking_payment_attempts_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint booking_payment_attempts_payment_fk foreign key (
    organization_id,
    booking_payment_id
  ) references public.booking_payments(organization_id, id) on delete cascade,
  constraint booking_payment_attempts_unique unique (
    booking_id,
    idempotency_key_hash
  )
);

create table public.booking_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  booking_id uuid not null,
  booking_payment_id uuid not null,
  status public.booking_refund_status not null default 'PENDING',
  amount_minor integer not null check (amount_minor > 0),
  reason text not null,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  recorded_by uuid not null
    references public.profiles(id) on delete restrict,
  confirmed_by uuid
    references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_refunds_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete restrict,
  constraint booking_refunds_payment_fk foreign key (
    organization_id,
    booking_payment_id
  ) references public.booking_payments(organization_id, id) on delete restrict
);

create index booking_refunds_booking_idx
  on public.booking_refunds (booking_id, status, created_at desc);

create table public.booking_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_id uuid not null,
  booking_payment_id uuid,
  object_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  checksum text,
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid
    references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejected_at timestamptz,
  deleted_at timestamptz,
  constraint booking_payment_proofs_booking_fk foreign key (
    organization_id,
    booking_id
  ) references public.bookings(organization_id, id) on delete cascade,
  constraint booking_payment_proofs_payment_fk foreign key (
    organization_id,
    booking_payment_id
  ) references public.booking_payments(organization_id, id) on delete cascade,
  constraint booking_payment_proofs_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete restrict
);

create index booking_payment_proofs_booking_idx
  on public.booking_payment_proofs (booking_id, uploaded_at desc)
  where deleted_at is null;

create or replace function beauty_private.is_valid_booking_transition(
  current_status public.booking_status,
  next_status public.booking_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case current_status
    when 'PENDING_PAYMENT' then next_status in ('CONFIRMED', 'CANCELLED', 'EXPIRED')
    when 'CONFIRMED' then next_status in ('CHECKED_IN', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED')
    when 'CHECKED_IN' then next_status in ('IN_SERVICE', 'CANCELLED')
    when 'IN_SERVICE' then next_status in ('COMPLETED', 'CANCELLED')
    else false
  end;
$$;

create or replace function beauty_private.enforce_booking_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> old.status
    and not beauty_private.is_valid_booking_transition(old.status, new.status)
  then
    raise exception 'INVALID_BOOKING_TRANSITION: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status in ('CANCELLED', 'EXPIRED', 'RESCHEDULED') then
    update public.booking_staff_allocations
      set is_blocking = false,
          updated_at = now()
      where booking_id = new.id
        and is_blocking;
    update public.booking_resource_allocations
      set is_blocking = false,
          updated_at = now()
      where booking_id = new.id
        and is_blocking;
  end if;

  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function beauty_private.sync_booking_hold_allocations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('EXPIRED', 'CANCELLED') and new.status <> old.status then
    update public.booking_staff_allocations
      set is_blocking = false,
          updated_at = now()
      where booking_hold_id = new.id
        and is_blocking;
    update public.booking_resource_allocations
      set is_blocking = false,
          updated_at = now()
      where booking_hold_id = new.id
        and is_blocking;
  end if;
  return new;
end;
$$;

create or replace function beauty_private.expire_booking_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  with expired as (
    update public.booking_holds
      set status = 'EXPIRED',
          updated_at = now()
      where status = 'ACTIVE'
        and expires_at <= now()
      returning id
  )
  select count(*) into expired_count from expired;

  update public.public_booking_sessions
    set status = 'EXPIRED'
    where status = 'ACTIVE'
      and expires_at <= now();

  return expired_count;
end;
$$;

create or replace function beauty_private.prevent_append_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'APPEND_ONLY_TABLE'
    using errcode = '55000';
end;
$$;

create trigger bookings_transition_before_update
before update on public.bookings
for each row execute function beauty_private.enforce_booking_transition();

create trigger booking_holds_allocation_after_update
after update of status on public.booking_holds
for each row execute function beauty_private.sync_booking_hold_allocations();

create trigger booking_events_append_only
before update or delete on public.booking_events
for each row execute function beauty_private.prevent_append_only_change();

alter table public.merchant_setup_progress
  add constraint merchant_setup_progress_test_booking_fk foreign key (
    organization_id,
    test_booking_id
  ) references public.bookings(organization_id, id) on delete restrict;

create trigger deposit_policies_updated_at
before update on public.deposit_policies
for each row execute function beauty_private.set_updated_at();
create trigger cancellation_policies_updated_at
before update on public.cancellation_policies
for each row execute function beauty_private.set_updated_at();
create trigger location_booking_policies_updated_at
before update on public.location_booking_policies
for each row execute function beauty_private.set_updated_at();
create trigger booking_holds_updated_at
before update on public.booking_holds
for each row execute function beauty_private.set_updated_at();
create trigger bookings_updated_at
before update on public.bookings
for each row execute function beauty_private.set_updated_at();
create trigger booking_segments_updated_at
before update on public.booking_segments
for each row execute function beauty_private.set_updated_at();
create trigger booking_staff_allocations_updated_at
before update on public.booking_staff_allocations
for each row execute function beauty_private.set_updated_at();
create trigger booking_resource_allocations_updated_at
before update on public.booking_resource_allocations
for each row execute function beauty_private.set_updated_at();
create trigger public_rate_limit_buckets_updated_at
before update on public.public_rate_limit_buckets
for each row execute function beauty_private.set_updated_at();
create trigger booking_payments_updated_at
before update on public.booking_payments
for each row execute function beauty_private.set_updated_at();
create trigger booking_refunds_updated_at
before update on public.booking_refunds
for each row execute function beauty_private.set_updated_at();

revoke all on function beauty_private.is_valid_booking_transition(
  public.booking_status,
  public.booking_status
) from public;
revoke all on function beauty_private.enforce_booking_transition() from public;
revoke all on function beauty_private.sync_booking_hold_allocations() from public;
revoke all on function beauty_private.expire_booking_holds() from public, anon, authenticated;
revoke all on function beauty_private.prevent_append_only_change() from public;
grant execute on function beauty_private.expire_booking_holds() to service_role;

select cron.schedule(
  'beauty-expire-booking-holds',
  '* * * * *',
  'select beauty_private.expire_booking_holds();'
);
