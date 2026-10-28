-- PostgreSQL does not create indexes for referencing foreign-key columns.
-- Add deterministic covering indexes for every public foreign key that is not
-- already covered by the leading columns of an existing valid index.
do $$
declare
  foreign_key record;
  index_name text;
begin
  for foreign_key in
    select
      constraint_record.conname as constraint_name,
      namespace_record.nspname as schema_name,
      relation_record.relname as table_name,
      string_agg(
        format('%I', attribute_record.attname),
        ', '
        order by key_record.ordinality
      ) as quoted_columns
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_class as relation_record
      on relation_record.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = relation_record.relnamespace
    cross join lateral unnest(constraint_record.conkey)
      with ordinality as key_record(attribute_number, ordinality)
    join pg_catalog.pg_attribute as attribute_record
      on attribute_record.attrelid = relation_record.oid
      and attribute_record.attnum = key_record.attribute_number
    where constraint_record.contype = 'f'
      and namespace_record.nspname = 'public'
      and not exists (
        select 1
        from pg_catalog.pg_index as index_record
        where index_record.indrelid = constraint_record.conrelid
          and index_record.indisvalid
          and index_record.indisready
          and (
            index_record.indkey::smallint[]
          )[0:cardinality(constraint_record.conkey) - 1]
            = constraint_record.conkey
      )
    group by
      constraint_record.oid,
      constraint_record.conname,
      namespace_record.nspname,
      relation_record.relname
    order by relation_record.relname, constraint_record.conname
  loop
    index_name :=
      left(foreign_key.table_name, 36)
      || '_fk_'
      || substr(
        md5(
          foreign_key.table_name
          || ':'
          || foreign_key.constraint_name
        ),
        1,
        12
      )
      || '_idx';

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.quoted_columns
    );
  end loop;
end
$$;
