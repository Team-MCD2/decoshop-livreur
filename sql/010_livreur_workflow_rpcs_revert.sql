-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Workflow RPCs (REVERT)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Removes everything created by 010_livreur_workflow_rpcs.sql in reverse
--  order. Safe to run multiple times.
--
--  ⚠ This DOES NOT undo any DATA written through the new RPCs (bl_attempt_log
--  rows, status history rows, profile skeletons, etc). It only drops the
--  functions, the trigger, and the realtime publication entries.
--
--  After running this script, the PWA will fall back to:
--    • direct UPDATEs on bons_livraison.statut (no validation)
--    • no failure-path RPC (the disabled stub in WorkflowActions stays)
--    • no auto-provisioning of livreur.profiles on signup
--    • no realtime events for livreur.bons_livraison until manually re-added
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Drop auto-provisioning trigger first (uses public.handle_new_livreur_user)
drop trigger if exists on_auth_user_created_livreur on auth.users;
drop function if exists public.handle_new_livreur_user();


-- ─── 2. Remove realtime publication entries (guarded — publication may not exist)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found — nothing to remove.';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'livreur' and tablename = 'bons_livraison'
  ) then
    alter publication supabase_realtime drop table livreur.bons_livraison;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'livreur' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime drop table livreur.notifications;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'livreur' and tablename = 'signatures_electroniques'
  ) then
    alter publication supabase_realtime drop table livreur.signatures_electroniques;
  end if;
end $$;


-- ─── 3. Drop the RPCs (reverse order of creation)
drop function if exists livreur.get_driver_period_score(date, date, uuid);
drop function if exists livreur.get_driver_daily_kpis(date, uuid);
drop function if exists livreur.record_failed_attempt(
  uuid, livreur.attempt_failure_reason, text, text, numeric, numeric
);
drop function if exists livreur.transition_bl_status(uuid, livreur.bl_status, jsonb);


-- ─── 4. Drop the state-machine helpers
drop function if exists livreur.my_allowed_bl_transitions(livreur.bl_status);
drop function if exists livreur.allowed_bl_transitions(livreur.bl_status, livreur.user_role);


-- ─── 5. De-register the migration
delete from public._migrations where filename = '010_livreur_workflow_rpcs.sql';


-- ════════════════════════════════════════════════════════════════════════════
--  Verification: re-run any of the verification queries from
--  010_livreur_workflow_rpcs.sql — they should all return 0 rows.
-- ════════════════════════════════════════════════════════════════════════════
