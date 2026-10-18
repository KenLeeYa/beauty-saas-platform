-- Additive synthetic benefit lifecycle. Existing issued benefits retain their terms.
alter table public.member_benefit_issues
  add column issue_key_hash text,
  add constraint member_benefit_issue_key_length check
    (issue_key_hash is null or length(issue_key_hash) = 64);
create unique index member_benefit_issue_key_unique
  on public.member_benefit_issues (organization_id, customer_id, issue_key_hash)
  where issue_key_hash is not null;
alter table public.member_benefit_events
  drop constraint member_benefit_events_kind_check;
alter table public.member_benefit_events
  add constraint member_benefit_events_kind_check
    check (kind in ('ISSUED','RESERVED','REDEEMED','RELEASED','REFUNDED','CANCELLED')),
  add column quantity integer not null default 1 check (quantity > 0),
  add column booking_refund_id uuid references public.booking_refunds(id);
create index member_benefit_events_booking_idx
  on public.member_benefit_events (issue_id, booking_id, kind);
