create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.invoke_notification_dispatch()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into app_url
  from vault.decrypted_secrets
  where name = 'beauty_app_url';

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'beauty_cron_secret';

  if app_url is null or cron_secret is null then
    raise exception 'Beauty notification cron Vault secrets are missing';
  end if;

  select net.http_get(
    url := rtrim(app_url, '/') || '/api/cron/notifications',
    headers := jsonb_build_object(
      'authorization',
      'Bearer ' || cron_secret
    ),
    timeout_milliseconds := 30000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_notification_dispatch()
  from public, anon, authenticated;
