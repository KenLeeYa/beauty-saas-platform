create or replace function beauty_private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
  limit 1;
$$;

create or replace function beauty_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = beauty_private.current_profile_id()
      and profile.is_active
      and profile.platform_role = 'PLATFORM_ADMIN'::public.user_role
  );
$$;

create or replace function beauty_private.is_organization_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.profile_id = beauty_private.current_profile_id()
      and membership.status = 'ACTIVE'::public.membership_status
  );
$$;

create or replace function beauty_private.can_access_organization(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_organization_member(target_organization_id)
    or exists (
      select 1
      from public.location_memberships membership
      where membership.organization_id = target_organization_id
        and membership.profile_id = beauty_private.current_profile_id()
        and membership.status = 'ACTIVE'::public.membership_status
    );
$$;

create or replace function beauty_private.has_organization_role(
  target_organization_id uuid,
  allowed_roles public.user_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.profile_id = beauty_private.current_profile_id()
      and membership.status = 'ACTIVE'::public.membership_status
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function beauty_private.has_location_role(
  target_location_id uuid,
  allowed_roles public.user_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin() or exists (
    select 1
    from public.location_memberships membership
    where membership.location_id = target_location_id
      and membership.profile_id = beauty_private.current_profile_id()
      and membership.status = 'ACTIVE'::public.membership_status
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function beauty_private.can_access_location(
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin()
    or exists (
      select 1
      from public.locations location
      join public.organization_memberships membership
        on membership.organization_id = location.organization_id
      where location.id = target_location_id
        and membership.profile_id = beauty_private.current_profile_id()
        and membership.status = 'ACTIVE'::public.membership_status
        and (
          membership.role = 'ORGANIZATION_OWNER'::public.user_role
          or (
            membership.role in (
              'ORGANIZATION_ADMIN'::public.user_role,
              'FINANCE_VIEWER'::public.user_role
            )
            and membership.all_locations
          )
        )
    )
    or exists (
      select 1
      from public.location_memberships membership
      where membership.location_id = target_location_id
        and membership.profile_id = beauty_private.current_profile_id()
        and membership.status = 'ACTIVE'::public.membership_status
    );
$$;

create or replace function beauty_private.can_manage_location(
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin()
    or exists (
      select 1
      from public.locations location
      join public.organization_memberships membership
        on membership.organization_id = location.organization_id
      where location.id = target_location_id
        and membership.profile_id = beauty_private.current_profile_id()
        and membership.status = 'ACTIVE'::public.membership_status
        and (
          membership.role = 'ORGANIZATION_OWNER'::public.user_role
          or (
            membership.role = 'ORGANIZATION_ADMIN'::public.user_role
            and membership.all_locations
          )
        )
    )
    or beauty_private.has_location_role(
      target_location_id,
      array[
        'ORGANIZATION_ADMIN'::public.user_role,
        'LOCATION_MANAGER'::public.user_role
      ]
    );
$$;

create or replace function beauty_private.can_operate_bookings(
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.can_manage_location(target_location_id)
    or beauty_private.has_location_role(
      target_location_id,
      array['FRONT_DESK'::public.user_role]
    );
$$;

create or replace function beauty_private.can_view_booking(
  target_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings booking
    where booking.id = target_booking_id
      and (
        beauty_private.can_operate_bookings(booking.location_id)
        or beauty_private.is_platform_admin()
        or exists (
          select 1
          from public.booking_staff_allocations allocation
          join public.staff_profiles staff
            on staff.id = allocation.staff_profile_id
          where allocation.booking_id = booking.id
            and staff.linked_profile_id = beauty_private.current_profile_id()
        )
      )
  );
$$;

create or replace function beauty_private.can_view_customer(
  target_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin()
    or exists (
      select 1
      from public.customers customer
      where customer.id = target_customer_id
        and beauty_private.has_organization_role(
          customer.organization_id,
          array[
            'ORGANIZATION_OWNER'::public.user_role,
            'ORGANIZATION_ADMIN'::public.user_role
          ]
        )
    )
    or exists (
      select 1
      from public.bookings booking
      where booking.customer_id = target_customer_id
        and (
          beauty_private.can_operate_bookings(booking.location_id)
          or beauty_private.can_view_booking(booking.id)
        )
    );
$$;

create or replace function beauty_private.can_view_sensitive_customer(
  target_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin()
    or exists (
      select 1
      from public.customers customer
      where customer.id = target_customer_id
        and beauty_private.has_organization_role(
          customer.organization_id,
          array[
            'ORGANIZATION_OWNER'::public.user_role,
            'ORGANIZATION_ADMIN'::public.user_role
          ]
        )
    )
    or exists (
      select 1
      from public.bookings booking
      where booking.customer_id = target_customer_id
        and beauty_private.can_manage_location(booking.location_id)
    );
$$;

create or replace function beauty_private.can_view_organization_financials(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.has_organization_role(
    target_organization_id,
    array[
      'ORGANIZATION_OWNER'::public.user_role,
      'FINANCE_VIEWER'::public.user_role
    ]
  );
$$;

create or replace function beauty_private.can_view_location_financials(
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select beauty_private.is_platform_admin()
    or exists (
      select 1
      from public.locations location
      where location.id = target_location_id
        and beauty_private.can_view_organization_financials(
          location.organization_id
        )
        and beauty_private.can_access_location(location.id)
    )
    or beauty_private.can_manage_location(target_location_id);
$$;

create or replace function beauty_private.can_view_profile(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id = beauty_private.current_profile_id()
    or beauty_private.is_platform_admin()
    or exists (
      select 1
      from public.organization_memberships target_membership
      where target_membership.profile_id = target_profile_id
        and beauty_private.has_organization_role(
          target_membership.organization_id,
          array[
            'ORGANIZATION_OWNER'::public.user_role,
            'ORGANIZATION_ADMIN'::public.user_role
          ]
        )
    )
    or exists (
      select 1
      from public.location_memberships target_membership
      where target_membership.profile_id = target_profile_id
        and beauty_private.can_manage_location(
          target_membership.location_id
        )
    );
$$;

revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema beauty_private to authenticated, service_role;

do $$
declare
  target_table record;
begin
  for target_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table public.%I enable row level security',
      target_table.tablename
    );
    execute format(
      'alter table public.%I force row level security',
      target_table.tablename
    );
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      target_table.tablename
    );
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      target_table.tablename
    );
  end loop;
end;
$$;

grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

grant select (
  id,
  name,
  slug,
  status,
  default_timezone,
  default_currency,
  default_locale,
  public_profile_enabled,
  created_at,
  updated_at
) on public.organizations to authenticated;

grant select (
  id,
  organization_id,
  name,
  slug,
  code,
  description,
  address,
  phone,
  timezone,
  currency,
  booking_state,
  online_booking_enabled,
  is_active,
  logo_path,
  cover_image_path,
  created_at,
  updated_at
) on public.locations to authenticated;

grant select (
  id,
  email,
  display_name,
  avatar_path,
  is_active,
  last_login_at,
  created_at,
  updated_at
) on public.profiles to authenticated;

grant select (
  id,
  organization_id,
  profile_id,
  role,
  status,
  all_locations,
  is_primary_owner,
  joined_at,
  created_at,
  updated_at
) on public.organization_memberships to authenticated;

grant select (
  id,
  organization_id,
  location_id,
  profile_id,
  role,
  status,
  joined_at,
  created_at,
  updated_at
) on public.location_memberships to authenticated;

grant select on public.service_categories to authenticated;
grant select on public.services to authenticated;
grant select on public.service_variants to authenticated;
grant select on public.location_services to authenticated;
grant select on public.service_addons to authenticated;
grant select on public.staff_profiles to authenticated;
grant select on public.staff_location_assignments to authenticated;
grant select on public.staff_service_assignments to authenticated;
grant select on public.service_staff_assignments to authenticated;
grant select on public.resource_types to authenticated;
grant select on public.resources to authenticated;
grant select on public.location_business_hours to authenticated;
grant select on public.operational_events to authenticated;
grant select on public.operational_alerts to authenticated;
grant select on public.daily_location_summaries to authenticated;
grant select on public.daily_staff_summaries to authenticated;
grant select on public.daily_service_summaries to authenticated;
grant select on public.plans to authenticated;
grant select on public.plan_versions to authenticated;
grant select on public.plan_entitlements to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.organization_feature_overrides to authenticated;
grant select on public.usage_events to authenticated;
grant select on public.billing_usage_summaries to authenticated;
grant select on public.invoices to authenticated;
grant select on public.invoice_line_items to authenticated;
grant select on public.manual_payment_records to authenticated;
grant select on public.billing_notifications to authenticated;
grant select on public.report_schedules to authenticated;

create policy organizations_member_select on public.organizations
for select to authenticated
using (beauty_private.can_access_organization(id));

create policy locations_member_select on public.locations
for select to authenticated
using (beauty_private.can_access_location(id));

create policy profiles_self_or_team_select on public.profiles
for select to authenticated
using (beauty_private.can_view_profile(id));

create policy organization_memberships_authorized_select
on public.organization_memberships
for select to authenticated
using (
  profile_id = beauty_private.current_profile_id()
  or beauty_private.has_organization_role(
    organization_id,
    array[
      'ORGANIZATION_OWNER'::public.user_role,
      'ORGANIZATION_ADMIN'::public.user_role
    ]
  )
);

create policy location_memberships_authorized_select
on public.location_memberships
for select to authenticated
using (
  profile_id = beauty_private.current_profile_id()
  or beauty_private.can_manage_location(location_id)
);

create policy auth_sessions_self_select on public.auth_sessions
for select to authenticated
using (profile_id = beauty_private.current_profile_id());

create policy merchant_applications_applicant_or_admin_select
on public.merchant_applications
for select to authenticated
using (
  applicant_profile_id = beauty_private.current_profile_id()
  or beauty_private.is_platform_admin()
);

create policy merchant_application_events_applicant_or_admin_select
on public.merchant_application_events
for select to authenticated
using (
  beauty_private.is_platform_admin()
  or exists (
    select 1
    from public.merchant_applications application
    where application.id = merchant_application_events.application_id
      and application.applicant_profile_id =
        beauty_private.current_profile_id()
  )
);

create policy plans_authenticated_select on public.plans
for select to authenticated
using (is_active);

create policy plan_versions_authenticated_select on public.plan_versions
for select to authenticated
using (
  effective_at <= now()
  and (retired_at is null or retired_at > now())
);

create policy plan_entitlements_authenticated_select on public.plan_entitlements
for select to authenticated
using (
  exists (
    select 1
    from public.plan_versions version
    where version.id = plan_entitlements.plan_version_id
      and version.effective_at <= now()
      and (version.retired_at is null or version.retired_at > now())
  )
);

create policy subscriptions_financial_select on public.subscriptions
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy organization_feature_overrides_owner_select
on public.organization_feature_overrides
for select to authenticated
using (
  beauty_private.is_platform_admin()
  or beauty_private.has_organization_role(
    organization_id,
    array['ORGANIZATION_OWNER'::public.user_role]
  )
);

create policy usage_events_financial_select on public.usage_events
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy billing_usage_summaries_financial_select
on public.billing_usage_summaries
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy invoices_financial_select on public.invoices
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy invoice_line_items_financial_select
on public.invoice_line_items
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy manual_payment_records_financial_select
on public.manual_payment_records
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy billing_notifications_financial_select
on public.billing_notifications
for select to authenticated
using (
  beauty_private.can_view_organization_financials(organization_id)
);

create policy audit_logs_manager_select on public.audit_logs
for select to authenticated
using (
  beauty_private.is_platform_admin()
  or (
    location_id is null
    and organization_id is not null
    and beauty_private.has_organization_role(
      organization_id,
      array[
        'ORGANIZATION_OWNER'::public.user_role,
        'ORGANIZATION_ADMIN'::public.user_role
      ]
    )
  )
  or (
    location_id is not null
    and beauty_private.can_manage_location(location_id)
  )
);

create policy customers_authorized_select on public.customers
for select to authenticated
using (beauty_private.can_view_customer(id));

create policy customer_contacts_authorized_select on public.customer_contacts
for select to authenticated
using (beauty_private.can_view_customer(customer_id));

create policy customer_tags_authorized_select on public.customer_tags
for select to authenticated
using (beauty_private.can_access_organization(organization_id));

create policy customer_tag_assignments_authorized_select
on public.customer_tag_assignments
for select to authenticated
using (beauty_private.can_view_customer(customer_id));

create policy customer_notes_sensitive_select on public.customer_notes
for select to authenticated
using (
  (
    sensitivity = 'STANDARD'
    and beauty_private.can_view_customer(customer_id)
  )
  or beauty_private.can_view_sensitive_customer(customer_id)
);

create policy customer_consents_sensitive_select on public.customer_consents
for select to authenticated
using (beauty_private.can_view_sensitive_customer(customer_id));

create policy customer_metrics_authorized_select on public.customer_metrics
for select to authenticated
using (beauty_private.can_view_customer(customer_id));

create policy customer_media_sensitive_select on public.customer_media
for select to authenticated
using (beauty_private.can_view_sensitive_customer(customer_id));

create policy customer_merge_events_manager_select
on public.customer_merge_events
for select to authenticated
using (
  beauty_private.has_organization_role(
    organization_id,
    array[
      'ORGANIZATION_OWNER'::public.user_role,
      'ORGANIZATION_ADMIN'::public.user_role
    ]
  )
);

create policy bookings_authorized_select on public.bookings
for select to authenticated
using (beauty_private.can_view_booking(id));

create policy booking_segments_authorized_select on public.booking_segments
for select to authenticated
using (beauty_private.can_view_booking(booking_id));

create policy booking_staff_allocations_authorized_select
on public.booking_staff_allocations
for select to authenticated
using (
  booking_id is not null
  and beauty_private.can_view_booking(booking_id)
);

create policy booking_resource_allocations_authorized_select
on public.booking_resource_allocations
for select to authenticated
using (
  booking_id is not null
  and beauty_private.can_view_booking(booking_id)
);

create policy booking_events_authorized_select on public.booking_events
for select to authenticated
using (beauty_private.can_view_booking(booking_id));

create policy booking_payments_financial_select on public.booking_payments
for select to authenticated
using (
  beauty_private.can_view_location_financials(location_id)
);

create policy booking_refunds_financial_select on public.booking_refunds
for select to authenticated
using (
  exists (
    select 1
    from public.bookings booking
    where booking.id = booking_refunds.booking_id
      and beauty_private.can_view_location_financials(
        booking.location_id
      )
  )
);

create policy booking_payment_proofs_manager_select
on public.booking_payment_proofs
for select to authenticated
using (beauty_private.can_manage_location(location_id));

create policy notification_integrations_manager_select
on public.notification_integrations
for select to authenticated
using (
  beauty_private.has_organization_role(
    organization_id,
    array[
      'ORGANIZATION_OWNER'::public.user_role,
      'ORGANIZATION_ADMIN'::public.user_role
    ]
  )
);

create policy notification_templates_manager_select
on public.notification_templates
for select to authenticated
using (
  organization_id is null
  or beauty_private.has_organization_role(
    organization_id,
    array[
      'ORGANIZATION_OWNER'::public.user_role,
      'ORGANIZATION_ADMIN'::public.user_role
    ]
  )
);

create policy operational_events_authorized_select
on public.operational_events
for select to authenticated
using (
  (
    location_id is not null
    and beauty_private.can_access_location(location_id)
  )
  or (
    location_id is null
    and beauty_private.can_access_organization(organization_id)
  )
);

create policy operational_alerts_manager_select
on public.operational_alerts
for select to authenticated
using (
  (
    location_id is not null
    and beauty_private.can_manage_location(location_id)
  )
  or (
    location_id is null
    and beauty_private.has_organization_role(
      organization_id,
      array[
        'ORGANIZATION_OWNER'::public.user_role,
        'ORGANIZATION_ADMIN'::public.user_role
      ]
    )
  )
);

create policy daily_location_summaries_financial_select
on public.daily_location_summaries
for select to authenticated
using (
  beauty_private.can_view_location_financials(location_id)
);

create policy daily_staff_summaries_financial_select
on public.daily_staff_summaries
for select to authenticated
using (
  beauty_private.can_view_location_financials(location_id)
);

create policy daily_service_summaries_financial_select
on public.daily_service_summaries
for select to authenticated
using (
  beauty_private.can_view_location_financials(location_id)
);

create policy report_schedules_manager_select on public.report_schedules
for select to authenticated
using (
  beauty_private.has_organization_role(
    organization_id,
    array[
      'ORGANIZATION_OWNER'::public.user_role,
      'ORGANIZATION_ADMIN'::public.user_role,
      'FINANCE_VIEWER'::public.user_role
    ]
  )
);

create policy organization_invitations_manager_select
on public.organization_invitations
for select to authenticated
using (
  (
    location_id is null
    and beauty_private.has_organization_role(
      organization_id,
      array['ORGANIZATION_OWNER'::public.user_role]
    )
  )
  or (
    location_id is not null
    and beauty_private.can_manage_location(location_id)
  )
);

do $$
declare
  target_table text;
  organization_tables text[] := array[
    'merchant_setup_progress',
    'service_categories',
    'services',
    'service_variants',
    'service_addons',
    'staff_profiles',
    'staff_service_assignments',
    'service_staff_assignments',
    'resource_types',
    'resources',
    'resource_availability_rules',
    'resource_time_off',
    'service_resource_requirements',
    'customer_contact_links'
  ];
  location_tables text[] := array[
    'location_business_hours',
    'location_services',
    'staff_location_assignments',
    'staff_availability_rules',
    'staff_time_off',
    'staff_schedule_exceptions',
    'deposit_policies',
    'cancellation_policies',
    'location_booking_policies'
  ];
begin
  foreach target_table in array organization_tables
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (beauty_private.can_access_organization(organization_id))',
      target_table || '_authorized_select',
      target_table
    );
  end loop;

  foreach target_table in array location_tables
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((location_id is not null and beauty_private.can_access_location(location_id)) or (location_id is null and beauty_private.can_access_organization(organization_id)))',
      target_table || '_authorized_select',
      target_table
    );
  end loop;
end;
$$;

revoke all on all functions in schema beauty_private from public, anon;
grant execute on function beauty_private.current_profile_id() to authenticated;
grant execute on function beauty_private.is_platform_admin() to authenticated;
grant execute on function beauty_private.is_organization_member(uuid) to authenticated;
grant execute on function beauty_private.can_access_organization(uuid) to authenticated;
grant execute on function beauty_private.has_organization_role(
  uuid,
  public.user_role[]
) to authenticated;
grant execute on function beauty_private.has_location_role(
  uuid,
  public.user_role[]
) to authenticated;
grant execute on function beauty_private.can_access_location(uuid) to authenticated;
grant execute on function beauty_private.can_manage_location(uuid) to authenticated;
grant execute on function beauty_private.can_operate_bookings(uuid) to authenticated;
grant execute on function beauty_private.can_view_booking(uuid) to authenticated;
grant execute on function beauty_private.can_view_customer(uuid) to authenticated;
grant execute on function beauty_private.can_view_sensitive_customer(uuid) to authenticated;
grant execute on function beauty_private.can_view_organization_financials(uuid) to authenticated;
grant execute on function beauty_private.can_view_location_financials(uuid) to authenticated;
grant execute on function beauty_private.can_view_profile(uuid) to authenticated;

grant execute on all functions in schema beauty_private to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'beauty-private',
  'beauty-private',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
