-- Requirements narrow existing assignments; empty requirements preserve existing bookings.
alter table public.location_services
  add column required_skills text[] not null default '{}',
  add constraint location_service_required_skills_limit
    check (cardinality(required_skills) <= 30 and array_position(required_skills, null) is null);
-- The existing table retains FORCE RLS, tenant/branch policies and server-only writes.
