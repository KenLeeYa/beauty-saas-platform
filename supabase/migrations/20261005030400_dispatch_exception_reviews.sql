create table public.booking_dispatch_exception_reviews (
  claim_id uuid primary key references public.booking_dispatch_claims(id),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null,
  reviewed_by_profile_id uuid not null references public.profiles(id),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  reviewed_at timestamptz not null default now(),
  foreign key (organization_id,location_id)
    references public.locations(organization_id,id)
);
alter table public.booking_dispatch_exception_reviews enable row level security;
create policy booking_dispatch_exception_reviews_read
  on public.booking_dispatch_exception_reviews for select to authenticated
  using (beauty_private.can_access_location(location_id));
