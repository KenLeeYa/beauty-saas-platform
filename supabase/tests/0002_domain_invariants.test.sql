begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok(
  exists (
    select 1
    from pg_trigger
    inner join pg_class on pg_class.oid = pg_trigger.tgrelid
    where pg_class.relname = 'organization_memberships'
      and pg_trigger.tgname = 'organization_memberships_last_owner_before_write'
      and not pg_trigger.tgisinternal
  ),
  'last organization owner protection trigger exists'
);

select ok(
  exists (
    select 1
    from pg_trigger
    inner join pg_class on pg_class.oid = pg_trigger.tgrelid
    where pg_class.relname = 'bookings'
      and pg_trigger.tgname = 'bookings_transition_before_update'
      and not pg_trigger.tgisinternal
  ),
  'booking state transition trigger exists'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'booking_staff_allocations_no_overlap'
      and contype = 'x'
  ),
  'staff allocations have a database exclusion constraint'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'booking_resource_allocations_no_overlap'
      and contype = 'x'
  ),
  'resource allocations have a database exclusion constraint'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'usage_events_idempotency_unique'
      and contype = 'u'
  ),
  'usage events are deduplicated by organization and idempotency key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'organization_feature_override_window_check'
      and contype = 'c'
  ),
  'feature override expiry windows are constrained'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'location_membership_location_fk'
      and contype = 'f'
  ),
  'location memberships enforce parent organization scope'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'bookings_customer_fk'
      and contype = 'f'
  ),
  'bookings enforce customer organization scope'
);

select ok(
  exists (
    select 1
    from pg_proc
    inner join pg_namespace
      on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'beauty_private'
      and pg_proc.proname = 'expire_booking_holds'
      and pg_proc.prosecdef
  ),
  'hold expiry runs through the reviewed privileged function'
);

select is(
  (
    select count(*)::integer
    from public.plan_entitlements
    inner join public.plan_versions
      on public.plan_versions.id = public.plan_entitlements.plan_version_id
    inner join public.plans
      on public.plans.id = public.plan_versions.plan_id
    where public.plans.code = 'TRIAL'
      and public.plan_entitlements.feature_key in (
        'RESOURCE_MANAGEMENT',
        'DEPOSITS',
        'CANCELLATION_RULES'
      )
      and public.plan_entitlements.is_enabled
  ),
  3,
  'trial includes every entitlement required to complete setup'
);

select * from finish();
rollback;
