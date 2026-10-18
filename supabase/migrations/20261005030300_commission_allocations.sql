-- Published allocation versions are immutable. A missing version blocks payroll for
-- a segment served by more than one provider.
create table public.commission_segment_allocation_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  booking_segment_id uuid not null,
  version integer not null check (version > 0),
  method text not null check (method in ('PERCENT','FIXED')),
  segment_price_minor integer not null check (segment_price_minor >= 0),
  commission_pool_minor integer not null check (commission_pool_minor >= 0),
  booking_version integer not null,
  published_by_profile_id uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  unique (organization_id,booking_segment_id,version),
  foreign key (organization_id,location_id)
    references public.locations(organization_id,id),
  foreign key (organization_id,booking_segment_id)
    references public.booking_segments(organization_id,id)
);
create table public.commission_segment_allocation_lines (
  allocation_set_id uuid not null references public.commission_segment_allocation_sets(id),
  staff_profile_id uuid not null references public.staff_profiles(id),
  share_bps integer check (share_bps between 0 and 10000),
  quoted_minor integer not null check (quoted_minor >= 0),
  primary key (allocation_set_id,staff_profile_id)
);
create function public.reject_commission_allocation_mutation() returns trigger
language plpgsql as $$ begin
  raise exception 'Published commission allocations are immutable';
end $$;
create trigger commission_allocation_set_immutable before update or delete
  on public.commission_segment_allocation_sets for each row
  execute function public.reject_commission_allocation_mutation();
create trigger commission_allocation_line_immutable before update or delete
  on public.commission_segment_allocation_lines for each row
  execute function public.reject_commission_allocation_mutation();
alter table public.commission_segment_allocation_sets enable row level security;
alter table public.commission_segment_allocation_lines enable row level security;
