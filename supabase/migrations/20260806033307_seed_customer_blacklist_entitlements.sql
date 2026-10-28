insert into public.plan_entitlements (
  plan_version_id,
  feature_key,
  is_enabled,
  limit_value,
  soft_limit
)
select
  version.id,
  'CUSTOMER_BLACKLIST'::public.feature_key,
  false,
  null,
  false
from public.plan_versions version
on conflict (plan_version_id, feature_key) do nothing;
