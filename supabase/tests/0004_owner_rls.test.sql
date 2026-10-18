begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

-- Test actual ownership without SUPERUSER/BYPASSRLS; rollback restores owners.
create role beauty_rls_owner_regression nologin nosuperuser nobypassrls;
do $$
begin
  execute format('grant beauty_rls_owner_regression to %I', current_user);
end;
$$;
grant usage, create on schema public to beauty_rls_owner_regression;
grant usage on schema extensions to beauty_rls_owner_regression;
alter table public.line_oauth_states owner to beauty_rls_owner_regression;
alter table public.member_wallet_accounts owner to beauty_rls_owner_regression;
alter table public.payroll_periods owner to beauty_rls_owner_regression;

set local role beauty_rls_owner_regression;
select ok(row_security_active('public.line_oauth_states'), 'OAuth table owner remains subject to RLS');
select ok(row_security_active('public.member_wallet_accounts'), 'wallet table owner remains subject to RLS');
select ok(row_security_active('public.payroll_periods'), 'payroll table owner remains subject to RLS');
select is((select count(*)::integer from public.line_oauth_states), 0, 'OAuth rows are denied to the unprivileged owner');
reset role;

set local role service_role;
select ok(not row_security_active('public.line_oauth_states'), 'trusted service role retains its explicit BYPASSRLS contract');
reset role;

select * from finish();
rollback;
