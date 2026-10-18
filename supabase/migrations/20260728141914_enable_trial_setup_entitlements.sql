update public.plan_entitlements
set is_enabled = true
from public.plan_versions
inner join public.plans
  on public.plans.id = public.plan_versions.plan_id
where public.plan_entitlements.plan_version_id = public.plan_versions.id
  and public.plans.code = 'TRIAL'
  and public.plan_entitlements.feature_key in (
    'RESOURCE_MANAGEMENT',
    'LINE_NOTIFICATIONS',
    'EMAIL_NOTIFICATIONS',
    'DEPOSITS',
    'CANCELLATION_RULES'
  );
