-- Descriptive profile skills only. Booking qualification remains in service_staff_assignments.
create table public.staff_skill_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index staff_skill_catalog_name_unique on public.staff_skill_catalog (organization_id, lower(name));

-- Preserve existing profile text; make its existing values selectable without rewriting staff or bookings.
insert into public.staff_skill_catalog (organization_id,name)
select distinct organization_id,btrim(skill)
from public.staff_profiles cross join lateral unnest(skills) skill
where length(btrim(skill)) between 1 and 80
on conflict do nothing;

alter table public.staff_skill_catalog enable row level security;
alter table public.staff_skill_catalog force row level security;
revoke all on public.staff_skill_catalog from anon, authenticated;
grant select on public.staff_skill_catalog to authenticated;
grant all on public.staff_skill_catalog to service_role;
create policy staff_skill_catalog_read on public.staff_skill_catalog for select to authenticated using (
  beauty_private.is_platform_admin()
  or beauty_private.has_organization_role(organization_id, array['ORGANIZATION_OWNER','ORGANIZATION_ADMIN']::public.user_role[])
  or exists (select 1 from public.locations location where location.organization_id=staff_skill_catalog.organization_id
    and beauty_private.has_location_role(location.id,array['LOCATION_MANAGER','FRONT_DESK']::public.user_role[]))
);
