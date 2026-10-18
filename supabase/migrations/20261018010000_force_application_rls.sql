-- Restore the existing security baseline for tables added after its first pass.
-- Do not change policies, privileges, ownership or business rows.
do $$
declare
  target_table record;
begin
  for target_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and not c.relforcerowsecurity
  loop
    execute format('alter table public.%I force row level security', target_table.relname);
  end loop;
end;
$$;
