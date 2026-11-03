-- The scheduler for push-dispatch (every minute) and recall-check (daily): docs/notifications.md.
-- The jobs themselves are created once by hand, because their shared secret lives in Vault, not in a migration.
-- Only where the extensions exist (hosted Supabase has both; the PGlite test database has neither).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;
