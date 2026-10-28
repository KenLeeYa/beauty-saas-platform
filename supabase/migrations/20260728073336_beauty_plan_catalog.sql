insert into public.plans (id, code, display_name, is_active)
values
  ('00000000-0000-4000-8000-000000000101', 'TRIAL', '免費試用', true),
  ('00000000-0000-4000-8000-000000000102', 'LITE', '輕量版', true),
  ('00000000-0000-4000-8000-000000000103', 'STANDARD', '標準版', true),
  ('00000000-0000-4000-8000-000000000104', 'PRO', '專業版', true),
  ('00000000-0000-4000-8000-000000000105', 'ENTERPRISE', '企業版', true)
on conflict (code) do update
set
  display_name = excluded.display_name,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.plan_versions (
  id,
  plan_id,
  version,
  monthly_price_minor,
  currency,
  trial_days,
  effective_at
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    1,
    0,
    'TWD',
    14,
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000102',
    1,
    59000,
    'TWD',
    14,
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000103',
    1,
    129000,
    'TWD',
    14,
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000104',
    1,
    249000,
    'TWD',
    14,
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000205',
    '00000000-0000-4000-8000-000000000105',
    1,
    0,
    'TWD',
    0,
    '2026-01-01T00:00:00Z'
  )
on conflict (plan_id, version) do update
set
  monthly_price_minor = excluded.monthly_price_minor,
  currency = excluded.currency,
  trial_days = excluded.trial_days,
  effective_at = excluded.effective_at,
  retired_at = null;

insert into public.plan_entitlements (
  plan_version_id,
  feature_key,
  is_enabled,
  limit_value,
  soft_limit
)
select
  plan_versions.id,
  feature_key,
  case
    when plans.code = 'TRIAL' then feature_key in (
      'ONLINE_BOOKING',
      'BASIC_CALENDAR',
      'STAFF_SCHEDULING',
      'CUSTOMER_CRM',
      'BUSINESS_HOURS'
    )
    when plans.code = 'LITE' then feature_key in (
      'ONLINE_BOOKING',
      'BASIC_CALENDAR',
      'STAFF_SCHEDULING',
      'CUSTOMER_CRM',
      'BUSINESS_HOURS',
      'EMAIL_NOTIFICATIONS'
    )
    when plans.code = 'STANDARD' then feature_key not in (
      'CUSTOM_DOMAIN',
      'WHITE_LABEL',
      'API_ACCESS',
      'WEBHOOK_ACCESS',
      'AI_ASSISTANT',
      'MARKETPLACE'
    )
    else true
  end,
  case
    when feature_key = 'MULTI_LOCATION' and plans.code in ('TRIAL', 'LITE') then 1
    when feature_key = 'MULTI_LOCATION' and plans.code = 'STANDARD' then 3
    when feature_key = 'MULTI_LOCATION' and plans.code = 'PRO' then 10
    else null
  end,
  false
from public.plans
inner join public.plan_versions
  on plan_versions.plan_id = plans.id
cross join unnest(enum_range(null::public.feature_key)) as feature_key
where plan_versions.retired_at is null
on conflict (plan_version_id, feature_key) do update
set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value,
  soft_limit = excluded.soft_limit;
