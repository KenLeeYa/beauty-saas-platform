create type public.schedule_exception_kind as enum (
  'AVAILABLE',
  'UNAVAILABLE'
);

create type public.customer_contact_type as enum (
  'PHONE',
  'EMAIL',
  'LINE'
);

create type public.customer_source as enum (
  'LINE',
  'GOOGLE',
  'INSTAGRAM',
  'FACEBOOK',
  'WEBSITE',
  'WALK_IN',
  'PHONE',
  'REFERRAL',
  'OTHER'
);

create type public.customer_note_sensitivity as enum (
  'STANDARD',
  'SENSITIVE',
  'MEDICAL'
);

create type public.consent_type as enum (
  'MARKETING',
  'SERVICE',
  'PHOTO'
);

create type public.consent_status as enum (
  'GRANTED',
  'REVOKED'
);

create type public.resource_kind as enum (
  'ROOM',
  'BED',
  'CHAIR',
  'NAIL_TABLE',
  'EYELASH_BED',
  'SPA_ROOM',
  'EQUIPMENT',
  'OTHER'
);

create table public.location_business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  segment_index smallint not null default 0 check (segment_index >= 0),
  opens_at time not null,
  closes_at time not null,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_business_hours_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint location_business_hours_time_check check (
    is_closed or closes_at > opens_at
  ),
  constraint location_business_hours_unique unique (
    location_id,
    day_of_week,
    segment_index
  )
);

create index location_business_hours_scope_idx
  on public.location_business_hours (organization_id, location_id, day_of_week);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_org_name_unique unique (
    organization_id,
    name
  ),
  constraint service_categories_org_id_unique unique (
    organization_id,
    id
  )
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  booking_notice text not null default '',
  image_path text,
  online_booking_enabled boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_organization_fk foreign key (organization_id)
    references public.organizations(id) on delete cascade,
  constraint services_category_fk foreign key (organization_id, category_id)
    references public.service_categories(organization_id, id)
    on delete set null (category_id),
  constraint services_org_name_unique unique (organization_id, name),
  constraint services_org_id_unique unique (organization_id, id)
);

create index services_org_active_idx
  on public.services (organization_id, is_active, sort_order);

create table public.service_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  price_minor integer not null check (price_minor >= 0),
  pre_buffer_minutes integer not null default 0
    check (pre_buffer_minutes between 0 and 240),
  post_buffer_minutes integer not null default 0
    check (post_buffer_minutes between 0 and 240),
  deposit_fixed_minor integer
    check (deposit_fixed_minor is null or deposit_fixed_minor >= 0),
  deposit_percentage numeric(5, 2)
    check (
      deposit_percentage is null
      or deposit_percentage between 0 and 100
    ),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_variants_service_fk foreign key (
    organization_id,
    service_id
  ) references public.services(organization_id, id) on delete cascade,
  constraint service_variants_deposit_mode_check check (
    not (
      deposit_fixed_minor is not null
      and deposit_percentage is not null
    )
  ),
  constraint service_variants_service_name_unique unique (
    service_id,
    name
  ),
  constraint service_variants_org_id_unique unique (
    organization_id,
    id
  )
);

create unique index service_variants_one_default_uidx
  on public.service_variants (service_id)
  where is_default and is_active;
create index service_variants_service_active_idx
  on public.service_variants (organization_id, service_id, is_active);

create table public.location_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  service_id uuid not null,
  service_variant_id uuid not null,
  price_override_minor integer
    check (price_override_minor is null or price_override_minor >= 0),
  duration_override_minutes integer
    check (
      duration_override_minutes is null
      or duration_override_minutes between 5 and 1440
    ),
  deposit_fixed_override_minor integer
    check (
      deposit_fixed_override_minor is null
      or deposit_fixed_override_minor >= 0
    ),
  deposit_percentage_override numeric(5, 2)
    check (
      deposit_percentage_override is null
      or deposit_percentage_override between 0 and 100
    ),
  online_booking_enabled boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_services_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint location_services_service_fk foreign key (
    organization_id,
    service_id
  ) references public.services(organization_id, id) on delete cascade,
  constraint location_services_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete cascade,
  constraint location_services_deposit_mode_check check (
    not (
      deposit_fixed_override_minor is not null
      and deposit_percentage_override is not null
    )
  ),
  constraint location_services_unique unique (
    location_id,
    service_variant_id
  ),
  constraint location_services_org_id_unique unique (
    organization_id,
    id
  )
);

create index location_services_catalog_idx
  on public.location_services (
    organization_id,
    location_id,
    is_active,
    online_booking_enabled,
    sort_order
  );

create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  duration_delta_minutes integer not null default 0
    check (duration_delta_minutes between 0 and 480),
  price_delta_minor integer not null default 0 check (price_delta_minor >= 0),
  online_booking_enabled boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_addons_service_fk foreign key (
    organization_id,
    service_id
  ) references public.services(organization_id, id) on delete cascade,
  constraint service_addons_unique unique (service_id, name),
  constraint service_addons_org_id_unique unique (organization_id, id)
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  linked_profile_id uuid
    references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 160),
  title text not null default '',
  bio text not null default '',
  photo_path text,
  skills text[] not null default '{}',
  public_visible boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint staff_profiles_org_id_unique unique (organization_id, id)
);

create unique index staff_profiles_linked_profile_uidx
  on public.staff_profiles (organization_id, linked_profile_id)
  where linked_profile_id is not null;
create index staff_profiles_org_active_idx
  on public.staff_profiles (organization_id, is_active, sort_order);

create table public.staff_location_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_profile_id uuid not null,
  location_id uuid not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_location_assignments_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint staff_location_assignments_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint staff_location_assignments_unique unique (
    staff_profile_id,
    location_id
  )
);

create index staff_location_assignments_location_idx
  on public.staff_location_assignments (
    organization_id,
    location_id,
    is_active
  );

create table public.staff_service_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_profile_id uuid not null,
  service_variant_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_service_assignments_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint staff_service_assignments_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete cascade,
  constraint staff_service_assignments_unique unique (
    staff_profile_id,
    service_variant_id
  )
);

create index staff_service_assignments_variant_idx
  on public.staff_service_assignments (
    organization_id,
    service_variant_id,
    is_active
  );

create table public.service_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_service_id uuid not null,
  staff_profile_id uuid not null,
  online_booking_enabled boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_staff_assignments_location_service_fk foreign key (
    organization_id,
    location_service_id
  ) references public.location_services(organization_id, id) on delete cascade,
  constraint service_staff_assignments_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint service_staff_assignments_unique unique (
    location_service_id,
    staff_profile_id
  )
);

create table public.staff_availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  staff_profile_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  segment_index smallint not null default 0 check (segment_index >= 0),
  starts_at time not null,
  ends_at time not null,
  effective_from date,
  effective_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_availability_rules_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint staff_availability_rules_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint staff_availability_rules_time_check check (ends_at > starts_at),
  constraint staff_availability_rules_date_check check (
    effective_until is null
    or effective_from is null
    or effective_until >= effective_from
  ),
  constraint staff_availability_rules_unique unique (
    location_id,
    staff_profile_id,
    day_of_week,
    segment_index,
    effective_from
  )
);

create index staff_availability_rules_lookup_idx
  on public.staff_availability_rules (
    organization_id,
    location_id,
    staff_profile_id,
    day_of_week,
    is_active
  );

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid,
  staff_profile_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_time_off_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint staff_time_off_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint staff_time_off_range_check check (ends_at > starts_at)
);

create index staff_time_off_lookup_idx
  on public.staff_time_off (
    organization_id,
    staff_profile_id,
    starts_at,
    ends_at
  );

create table public.staff_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  staff_profile_id uuid not null,
  exception_date date not null,
  kind public.schedule_exception_kind not null,
  starts_at time,
  ends_at time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_schedule_exceptions_staff_fk foreign key (
    organization_id,
    staff_profile_id
  ) references public.staff_profiles(organization_id, id) on delete cascade,
  constraint staff_schedule_exceptions_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint staff_schedule_exceptions_time_check check (
    (
      kind = 'UNAVAILABLE'
      and starts_at is null
      and ends_at is null
    )
    or (
      starts_at is not null
      and ends_at is not null
      and ends_at > starts_at
    )
  ),
  constraint staff_schedule_exceptions_unique unique (
    location_id,
    staff_profile_id,
    exception_date,
    kind,
    starts_at
  )
);

create index staff_schedule_exceptions_lookup_idx
  on public.staff_schedule_exceptions (
    organization_id,
    location_id,
    staff_profile_id,
    exception_date
  );

create table public.resource_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind public.resource_kind not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_types_org_name_unique unique (organization_id, name),
  constraint resource_types_org_id_unique unique (organization_id, id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  resource_type_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint resources_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint resources_type_fk foreign key (
    organization_id,
    resource_type_id
  ) references public.resource_types(organization_id, id) on delete restrict,
  constraint resources_location_name_unique unique (location_id, name),
  constraint resources_org_id_unique unique (organization_id, id)
);

create index resources_location_active_idx
  on public.resources (organization_id, location_id, is_active, resource_type_id);

create table public.resource_availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  resource_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  segment_index smallint not null default 0 check (segment_index >= 0),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_availability_rules_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.resources(organization_id, id) on delete cascade,
  constraint resource_availability_rules_time_check check (ends_at > starts_at),
  constraint resource_availability_rules_unique unique (
    resource_id,
    day_of_week,
    segment_index
  )
);

create table public.resource_time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_time_off_resource_fk foreign key (
    organization_id,
    resource_id
  ) references public.resources(organization_id, id) on delete cascade,
  constraint resource_time_off_range_check check (ends_at > starts_at)
);

create index resource_time_off_lookup_idx
  on public.resource_time_off (
    organization_id,
    resource_id,
    starts_at,
    ends_at
  );

create table public.service_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_variant_id uuid not null,
  resource_type_id uuid not null,
  quantity integer not null default 1 check (quantity between 1 and 20),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_resource_requirements_variant_fk foreign key (
    organization_id,
    service_variant_id
  ) references public.service_variants(organization_id, id) on delete cascade,
  constraint service_resource_requirements_type_fk foreign key (
    organization_id,
    resource_type_id
  ) references public.resource_types(organization_id, id) on delete restrict,
  constraint service_resource_requirements_unique unique (
    service_variant_id,
    resource_type_id
  )
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 160),
  birthday date,
  preferred_language text not null default 'zh-Hant-TW',
  contact_preference public.customer_contact_type,
  source public.customer_source not null default 'OTHER',
  preferred_staff_id uuid,
  general_preferences text,
  is_active boolean not null default true,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_preferred_staff_fk foreign key (
    organization_id,
    preferred_staff_id
  ) references public.staff_profiles(organization_id, id)
    on delete set null (preferred_staff_id),
  constraint customers_org_id_unique unique (organization_id, id)
);

create index customers_org_active_idx
  on public.customers (organization_id, is_active, created_at desc);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  contact_type public.customer_contact_type not null,
  value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade
);

create unique index customer_contacts_org_normalized_uidx
  on public.customer_contacts (
    organization_id,
    contact_type,
    normalized_value
  );
create unique index customer_contacts_one_primary_uidx
  on public.customer_contacts (customer_id, contact_type)
  where is_primary;
create index customer_contacts_customer_idx
  on public.customer_contacts (organization_id, customer_id);

create table public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_tags_org_name_unique unique (organization_id, name),
  constraint customer_tags_org_id_unique unique (organization_id, id)
);

create table public.customer_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  tag_id uuid not null,
  assigned_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_tag_assignments_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade,
  constraint customer_tag_assignments_tag_fk foreign key (
    organization_id,
    tag_id
  ) references public.customer_tags(organization_id, id) on delete cascade,
  constraint customer_tag_assignments_unique unique (customer_id, tag_id)
);

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  sensitivity public.customer_note_sensitivity not null default 'STANDARD',
  note text not null check (char_length(note) between 1 and 5000),
  created_by uuid not null
    references public.profiles(id) on delete restrict,
  updated_by uuid
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint customer_notes_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade
);

create index customer_notes_customer_idx
  on public.customer_notes (organization_id, customer_id, created_at desc)
  where deleted_at is null;

create table public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  consent_type public.consent_type not null,
  status public.consent_status not null,
  captured_at timestamptz not null default now(),
  source text not null,
  policy_version text not null,
  evidence_hash text,
  created_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_consents_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade
);

create index customer_consents_latest_idx
  on public.customer_consents (
    organization_id,
    customer_id,
    consent_type,
    captured_at desc
  );

create table public.customer_metrics (
  customer_id uuid primary key,
  organization_id uuid not null,
  last_service_at timestamptz,
  completed_count integer not null default 0 check (completed_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  total_spend_minor bigint not null default 0 check (total_spend_minor >= 0),
  average_ticket_minor integer not null default 0 check (average_ticket_minor >= 0),
  estimated_ltv_minor bigint not null default 0 check (estimated_ltv_minor >= 0),
  expected_return_date date,
  updated_at timestamptz not null default now(),
  constraint customer_metrics_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade,
  constraint customer_metrics_org_customer_unique unique (
    organization_id,
    customer_id
  )
);

create table public.customer_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid,
  customer_id uuid not null,
  object_path text not null,
  media_type text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  checksum text,
  consent_id uuid
    references public.customer_consents(id) on delete set null,
  uploaded_by uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  retention_until timestamptz,
  constraint customer_media_customer_fk foreign key (
    organization_id,
    customer_id
  ) references public.customers(organization_id, id) on delete cascade,
  constraint customer_media_location_fk foreign key (
    organization_id,
    location_id
  ) references public.locations(organization_id, id) on delete cascade,
  constraint customer_media_object_path_unique unique (object_path)
);

create index customer_media_customer_idx
  on public.customer_media (organization_id, customer_id, created_at desc)
  where deleted_at is null;

create table public.customer_merge_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_customer_id uuid not null,
  target_customer_id uuid not null,
  merged_by uuid not null
    references public.profiles(id) on delete restrict,
  reason text not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint customer_merge_source_fk foreign key (
    organization_id,
    source_customer_id
  ) references public.customers(organization_id, id) on delete restrict,
  constraint customer_merge_target_fk foreign key (
    organization_id,
    target_customer_id
  ) references public.customers(organization_id, id) on delete restrict,
  constraint customer_merge_distinct_check check (
    source_customer_id <> target_customer_id
  )
);

create index customer_merge_events_org_idx
  on public.customer_merge_events (organization_id, created_at desc);

create trigger location_business_hours_updated_at
before update on public.location_business_hours
for each row execute function beauty_private.set_updated_at();
create trigger service_categories_updated_at
before update on public.service_categories
for each row execute function beauty_private.set_updated_at();
create trigger services_updated_at
before update on public.services
for each row execute function beauty_private.set_updated_at();
create trigger service_variants_updated_at
before update on public.service_variants
for each row execute function beauty_private.set_updated_at();
create trigger location_services_updated_at
before update on public.location_services
for each row execute function beauty_private.set_updated_at();
create trigger service_addons_updated_at
before update on public.service_addons
for each row execute function beauty_private.set_updated_at();
create trigger staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function beauty_private.set_updated_at();
create trigger staff_location_assignments_updated_at
before update on public.staff_location_assignments
for each row execute function beauty_private.set_updated_at();
create trigger staff_service_assignments_updated_at
before update on public.staff_service_assignments
for each row execute function beauty_private.set_updated_at();
create trigger service_staff_assignments_updated_at
before update on public.service_staff_assignments
for each row execute function beauty_private.set_updated_at();
create trigger staff_availability_rules_updated_at
before update on public.staff_availability_rules
for each row execute function beauty_private.set_updated_at();
create trigger staff_time_off_updated_at
before update on public.staff_time_off
for each row execute function beauty_private.set_updated_at();
create trigger staff_schedule_exceptions_updated_at
before update on public.staff_schedule_exceptions
for each row execute function beauty_private.set_updated_at();
create trigger resource_types_updated_at
before update on public.resource_types
for each row execute function beauty_private.set_updated_at();
create trigger resources_updated_at
before update on public.resources
for each row execute function beauty_private.set_updated_at();
create trigger resource_availability_rules_updated_at
before update on public.resource_availability_rules
for each row execute function beauty_private.set_updated_at();
create trigger resource_time_off_updated_at
before update on public.resource_time_off
for each row execute function beauty_private.set_updated_at();
create trigger service_resource_requirements_updated_at
before update on public.service_resource_requirements
for each row execute function beauty_private.set_updated_at();
create trigger customers_updated_at
before update on public.customers
for each row execute function beauty_private.set_updated_at();
create trigger customer_contacts_updated_at
before update on public.customer_contacts
for each row execute function beauty_private.set_updated_at();
create trigger customer_tags_updated_at
before update on public.customer_tags
for each row execute function beauty_private.set_updated_at();
create trigger customer_notes_updated_at
before update on public.customer_notes
for each row execute function beauty_private.set_updated_at();
