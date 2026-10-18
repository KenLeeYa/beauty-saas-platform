-- Synthetic-only wallet primitives. Production issuance remains application-gated.
create table public.member_wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  currency text not null default 'TWD',
  created_at timestamptz not null default now(),
  constraint member_wallet_accounts_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id),
  constraint member_wallet_accounts_unique unique (organization_id, customer_id, currency)
);

create table public.member_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.member_wallet_accounts(id),
  kind text not null check (kind in ('TOPUP', 'REDEMPTION', 'REFUND')),
  idempotency_hash text not null check (length(idempotency_hash) = 64),
  booking_id uuid,
  booking_payment_id uuid,
  booking_refund_id uuid references public.booking_refunds(id),
  original_transaction_id uuid references public.member_wallet_transactions(id),
  amount_minor bigint not null check (amount_minor > 0),
  paid_minor bigint not null check (paid_minor >= 0),
  bonus_minor bigint not null check (bonus_minor >= 0),
  allocation_policy text not null check (allocation_policy in ('PAID_FIRST', 'PRO_RATA_10_1', 'ORIGINAL')),
  created_at timestamptz not null default now(),
  constraint member_wallet_transactions_split_check check (paid_minor + bonus_minor = amount_minor),
  constraint member_wallet_transactions_booking_fk foreign key (organization_id, booking_id)
    references public.bookings(organization_id, id),
  constraint member_wallet_transactions_payment_fk foreign key (organization_id, booking_payment_id)
    references public.booking_payments(organization_id, id),
  constraint member_wallet_transactions_idempotency_unique unique (account_id, idempotency_hash)
);

create table public.member_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.member_wallet_accounts(id),
  transaction_id uuid not null references public.member_wallet_transactions(id),
  component text not null check (component in ('PAID', 'BONUS')),
  delta_minor bigint not null check (delta_minor <> 0),
  created_at timestamptz not null default now(),
  constraint member_wallet_entries_component_unique unique (transaction_id, component)
);
create index member_wallet_entries_balance_idx on public.member_wallet_entries (account_id, component);

create table public.member_wallet_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.member_wallet_accounts(id),
  booking_id uuid not null,
  idempotency_hash text not null check (length(idempotency_hash) = 64),
  qr_token_hash text not null unique check (length(qr_token_hash) = 64),
  amount_minor bigint not null check (amount_minor > 0),
  paid_minor bigint not null check (paid_minor >= 0),
  bonus_minor bigint not null check (bonus_minor >= 0),
  allocation_policy text not null check (allocation_policy in ('PAID_FIRST', 'PRO_RATA_10_1')),
  status text not null default 'RESERVED' check (status in ('RESERVED', 'REDEEMED', 'RELEASED')),
  expires_at timestamptz not null,
  redemption_transaction_id uuid references public.member_wallet_transactions(id),
  created_at timestamptz not null default now(),
  constraint member_wallet_reservations_split_check check (paid_minor + bonus_minor = amount_minor),
  constraint member_wallet_reservations_booking_fk foreign key (organization_id, booking_id)
    references public.bookings(organization_id, id),
  constraint member_wallet_reservations_idempotency_unique unique (account_id, idempotency_hash)
);
create index member_wallet_reservations_active_idx
  on public.member_wallet_reservations (account_id, status, expires_at);

create table public.member_benefit_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  kind text not null check (kind in ('COUPON', 'SERVICE_PACKAGE')),
  terms_snapshot jsonb not null,
  policy_id uuid references public.member_promotion_policies(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint member_benefit_issues_customer_fk foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
);
create table public.member_benefit_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.member_benefit_issues(id),
  kind text not null check (kind in ('ISSUED', 'RESERVED', 'REDEEMED', 'RELEASED', 'REFUNDED')),
  quantity_delta integer not null,
  idempotency_hash text not null check (length(idempotency_hash) = 64),
  booking_id uuid references public.bookings(id),
  created_at timestamptz not null default now(),
  constraint member_benefit_events_idempotency_unique unique (issue_id, idempotency_hash)
);

create function beauty_private.prevent_member_ledger_change() returns trigger
language plpgsql as $$ begin raise exception 'Member ledger is append-only'; end $$;
create trigger member_wallet_entries_append_only before update or delete on public.member_wallet_entries
  for each row execute function beauty_private.prevent_member_ledger_change();
create trigger member_benefit_events_append_only before update or delete on public.member_benefit_events
  for each row execute function beauty_private.prevent_member_ledger_change();

alter table public.member_wallet_accounts enable row level security;
alter table public.member_wallet_transactions enable row level security;
alter table public.member_wallet_entries enable row level security;
alter table public.member_wallet_reservations enable row level security;
alter table public.member_benefit_issues enable row level security;
alter table public.member_benefit_events enable row level security;
-- All writes and financial reads use verified server context; no direct client policies.
