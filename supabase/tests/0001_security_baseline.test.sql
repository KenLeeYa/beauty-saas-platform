begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select is(
  (
    select count(*)::integer
    from pg_class
    inner join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p')
      and not pg_class.relrowsecurity
  ),
  0,
  'all public tables have row-level security enabled'
);

select is(
  (
    select count(*)::integer
    from pg_class
    inner join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p')
      and not pg_class.relforcerowsecurity
  ),
  0,
  'all public tables force row-level security'
);

select is(
  (
    select count(*)::integer
    from pg_tables
    where schemaname = 'public'
      and (
        has_table_privilege('anon', quote_ident(schemaname) || '.' || quote_ident(tablename), 'INSERT')
        or has_table_privilege('anon', quote_ident(schemaname) || '.' || quote_ident(tablename), 'UPDATE')
        or has_table_privilege('anon', quote_ident(schemaname) || '.' || quote_ident(tablename), 'DELETE')
      )
  ),
  0,
  'anon has no direct business-table writes'
);

select is(
  (
    select count(*)::integer
    from pg_tables
    where schemaname = 'public'
      and (
        has_table_privilege('authenticated', quote_ident(schemaname) || '.' || quote_ident(tablename), 'INSERT')
        or has_table_privilege('authenticated', quote_ident(schemaname) || '.' || quote_ident(tablename), 'UPDATE')
        or has_table_privilege('authenticated', quote_ident(schemaname) || '.' || quote_ident(tablename), 'DELETE')
      )
  ),
  0,
  'authenticated users cannot bypass trusted mutation handlers'
);

select is(
  (
    select count(*)::integer
    from pg_proc
    inner join pg_namespace
      on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname in ('public', 'beauty_private')
      and pg_proc.prosecdef
      and has_function_privilege('anon', pg_proc.oid, 'EXECUTE')
  ),
  0,
  'anon cannot execute privileged application functions'
);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'beauty-private'
      and public
  ),
  0,
  'the Beauty object bucket is private'
);

select * from finish();
rollback;
