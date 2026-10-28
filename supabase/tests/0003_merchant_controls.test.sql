begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select ok(
  'CUSTOMER_BLACKLIST' = any(enum_range(null::public.feature_key)::text[]),
  'customer blacklist entitlement key exists'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name in (
        'deposit_mode',
        'is_blacklisted',
        'blacklist_reason',
        'blacklisted_at'
      )
  ),
  4,
  'customer deposit and blacklist fields exist'
);

select ok(
  exists (
    select 1
    from pg_class
    inner join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'location_day_schedules'
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  'day schedules enable and force row-level security'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'location_day_schedules'
      and policyname = 'location_day_schedules_authorized_select'
  ),
  'day schedules have an authorized select policy'
);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'beauty-public'
      and public
      and file_size_limit = 5242880
  ),
  1,
  'public media bucket has the expected size limit'
);

insert into public.organizations (
  id,
  name,
  slug,
  business_name,
  email,
  phone
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'RLS Brand A',
    'rls-brand-a',
    'RLS Brand A',
    'rls-a@example.test',
    '0900000001'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    'RLS Brand B',
    'rls-brand-b',
    'RLS Brand B',
    'rls-b@example.test',
    '0900000002'
  );

insert into public.locations (
  id,
  organization_id,
  name,
  slug,
  code
)
values
  (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Branch A',
    'branch-a',
    'A'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Branch B',
    'branch-b',
    'B'
  );

insert into public.profiles (
  id,
  auth_user_id,
  email,
  display_name
)
values (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  'rls-owner@example.test',
  'RLS Owner'
);

insert into public.organization_memberships (
  organization_id,
  profile_id,
  role,
  status,
  all_locations,
  is_primary_owner
)
values (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'ORGANIZATION_OWNER',
  'ACTIVE',
  true,
  true
);

insert into public.location_day_schedules (
  organization_id,
  location_id,
  schedule_date,
  opens_at,
  closes_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2026-08-08',
    '09:00',
    '18:00'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '2026-08-08',
    '10:00',
    '19:00'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000004',
  true
);

select is(
  (select count(*)::integer from public.location_day_schedules),
  1,
  'organization owner sees schedules from the owned tenant only'
);

select is(
  (
    select count(*)::integer
    from public.location_day_schedules
    where organization_id = '20000000-0000-4000-8000-000000000001'
  ),
  0,
  'organization owner cannot read another tenant schedule'
);

reset role;

select throws_ok(
  $$
    insert into public.location_day_schedules (
      organization_id,
      location_id,
      schedule_date,
      segment_index,
      opens_at,
      closes_at
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '2026-08-09',
      0,
      '18:00',
      '09:00'
    )
  $$,
  '23514',
  null,
  'day schedule rejects inverted opening windows'
);

select * from finish();
rollback;
