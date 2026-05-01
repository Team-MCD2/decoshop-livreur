-- ════════════════════════════════════════════════════════════════════════════
--  REVERT — undo 003_livreur_schema.sql (and 004, 005, 006)
-- ════════════════════════════════════════════════════════════════════════════
--  ⚠ DESTRUCTIVE — drops the entire livreur schema, all tables, all data.
--  Take a backup first:
--    pg_dump --schema=livreur ...
--  or via Supabase Studio → Database → Backups.
--
--  This single file reverts 003 + 004 + 005 + 006 because `drop schema cascade`
--  pulls everything in `livreur.*` (tables, indexes, triggers, functions,
--  views, RLS policies, RPCs, ENUMs) at once. For storage buckets/policies
--  see 007_livreur_storage_revert.sql.
--
--  public.articles is untouched.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Unschedule the pg_cron job if it was scheduled (safe if not)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('livreur-expire-pending-signatures')
       from cron.job
      where jobname = 'livreur-expire-pending-signatures';
  end if;
exception
  when others then null;  -- pg_cron not installed or job not found → ignore
end $$;

-- 2. Drop the entire schema
drop schema if exists livreur cascade;

-- 3. Unregister the migrations
delete from public._migrations
 where filename in (
   '003_livreur_schema.sql',
   '004_livreur_triggers_views.sql',
   '005_livreur_rls.sql',
   '006_livreur_signature_rpcs.sql'
 );

-- 4. Sanity check
do $$
declare v_count integer;
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'articles')
  then
    select count(*) into v_count from public.articles;
    raise notice 'public.articles intact: % rows', v_count;
  end if;
end $$;
