-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur RLS Policies  (role-based, per-operation)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Splits each table's access matrix into one policy per operation
--  (SELECT / INSERT / UPDATE / DELETE) for readable audit and surgical
--  revocation. Uses helper functions defined in 004:
--    livreur.is_admin()
--    livreur.is_admin_or_vendeur()
--    livreur.is_livreur()
--    livreur.current_user_role()
--
--  ─── Roles & access summary ─────────────────────────────────────────────────
--
--    role                    │ profiles │ clients │ commandes │ BLs       │ signatures
--    ───────────────────────┼──────────┼─────────┼───────────┼───────────┼───────────
--    admin                   │ R/W all  │ R/W all │ R/W all   │ R/W all   │ R all
--    vendeur / vendeur_propr │ R all    │ R/W all │ R/W all   │ R/W all   │ R all
--    livreur                 │ R own    │ R own*  │ R own*    │ R/U own** │ R own**
--    anon                    │ —        │ —       │ —         │ —         │ via RPC
--
--    * "own" for client/commande means "linked to a BL the livreur is assigned to"
--    ** livreur can update own BLs only in operational statuses, never DELETE
--    Anon access to signatures goes through livreur.submit_signature() (006),
--    which is SECURITY DEFINER and bypasses RLS deliberately.
--
--  Run AFTER: 003_livreur_schema.sql, 004_livreur_triggers_views.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on every table (idempotent — no-op if already enabled)
-- ─────────────────────────────────────────────────────────────────────────────
alter table livreur.profiles                  enable row level security;
alter table livreur.clients                   enable row level security;
alter table livreur.commandes                 enable row level security;
alter table livreur.bons_livraison            enable row level security;
alter table livreur.lignes_bl                 enable row level security;
alter table livreur.creneaux_livraison        enable row level security;
alter table livreur.signatures_electroniques  enable row level security;
alter table livreur.driver_locations          enable row level security;
alter table livreur.notifications             enable row level security;
alter table livreur.push_subscriptions        enable row level security;
alter table livreur.bl_attempt_log            enable row level security;
alter table livreur.bl_status_history         enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT: own row, OR admin/vendeur sees all (livreur list, vendeur switching).
drop policy if exists profiles_select on livreur.profiles;
create policy profiles_select on livreur.profiles
  for select to authenticated
  using (id = auth.uid() or livreur.is_admin_or_vendeur());

-- INSERT: only admin can create profiles for other users; user can self-insert
-- their own row (used by the auto-provisioning trigger when a new auth.user
-- signs up — though we recommend doing that via an Edge Function).
drop policy if exists profiles_insert on livreur.profiles;
create policy profiles_insert on livreur.profiles
  for insert to authenticated
  with check (livreur.is_admin() or id = auth.uid());

-- UPDATE: own row, OR admin can update anyone (role changes, deactivation).
drop policy if exists profiles_update on livreur.profiles;
create policy profiles_update on livreur.profiles
  for update to authenticated
  using       (id = auth.uid() or livreur.is_admin())
  with check  (id = auth.uid() or livreur.is_admin());

-- DELETE: admin only. (auth.users CASCADE already removes profiles, so this
-- is mostly defensive against direct deletes.)
drop policy if exists profiles_delete on livreur.profiles;
create policy profiles_delete on livreur.profiles
  for delete to authenticated
  using (livreur.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. clients
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT: admin/vendeur sees all; livreur sees only clients linked to their BLs.
drop policy if exists clients_select on livreur.clients;
create policy clients_select on livreur.clients
  for select to authenticated
  using (
    livreur.is_admin_or_vendeur()
    or exists (
      select 1 from livreur.bons_livraison bl
       where bl.client_id = clients.id and bl.livreur_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: admin/vendeur only. Livreurs never create clients.
drop policy if exists clients_modify on livreur.clients;
create policy clients_modify on livreur.clients
  for all to authenticated
  using       (livreur.is_admin_or_vendeur())
  with check  (livreur.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. commandes
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists commandes_select on livreur.commandes;
create policy commandes_select on livreur.commandes
  for select to authenticated
  using (
    livreur.is_admin_or_vendeur()
    or exists (
      select 1 from livreur.bons_livraison bl
       where bl.commande_id = commandes.id and bl.livreur_id = auth.uid()
    )
  );

drop policy if exists commandes_modify on livreur.commandes;
create policy commandes_modify on livreur.commandes
  for all to authenticated
  using       (livreur.is_admin_or_vendeur())
  with check  (livreur.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. bons_livraison
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT: livreur sees own BLs; vendeur sees BLs they created; admin sees all.
drop policy if exists bl_select on livreur.bons_livraison;
create policy bl_select on livreur.bons_livraison
  for select to authenticated
  using (
    livreur_id  = auth.uid()
    or vendeur_id = auth.uid()
    or livreur.is_admin_or_vendeur()
  );

-- INSERT: admin/vendeur only.
drop policy if exists bl_insert on livreur.bons_livraison;
create policy bl_insert on livreur.bons_livraison
  for insert to authenticated
  with check (livreur.is_admin_or_vendeur());

-- UPDATE livreur scope: own BLs only, in operational statuses, can't reassign.
drop policy if exists bl_update_livreur on livreur.bons_livraison;
create policy bl_update_livreur on livreur.bons_livraison
  for update to authenticated
  using (
    livreur_id = auth.uid()
    and statut in ('assigne','confirme','release_demandee','en_livraison','en_route','livre','echec_T1','echec_T2')
  )
  with check (livreur_id = auth.uid());

-- UPDATE admin/vendeur scope: any BL, any field.
drop policy if exists bl_update_admin on livreur.bons_livraison;
create policy bl_update_admin on livreur.bons_livraison
  for update to authenticated
  using       (livreur.is_admin_or_vendeur())
  with check  (livreur.is_admin_or_vendeur());

-- DELETE: admin only (BLs are quasi-immutable for audit).
drop policy if exists bl_delete on livreur.bons_livraison;
create policy bl_delete on livreur.bons_livraison
  for delete to authenticated
  using (livreur.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. lignes_bl
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT: anyone who can see the parent BL.
drop policy if exists lignes_bl_select on livreur.lignes_bl;
create policy lignes_bl_select on livreur.lignes_bl
  for select to authenticated
  using (
    exists (
      select 1 from livreur.bons_livraison bl
       where bl.id = lignes_bl.bl_id
         and (bl.livreur_id = auth.uid() or bl.vendeur_id = auth.uid() or livreur.is_admin_or_vendeur())
    )
  );

-- INSERT/UPDATE/DELETE: admin/vendeur only.
drop policy if exists lignes_bl_modify on livreur.lignes_bl;
create policy lignes_bl_modify on livreur.lignes_bl
  for all to authenticated
  using       (livreur.is_admin_or_vendeur())
  with check  (livreur.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. creneaux_livraison
-- ─────────────────────────────────────────────────────────────────────────────
-- Driver manages their own slots; admin/vendeur see + manage all (planning).
drop policy if exists creneaux_select on livreur.creneaux_livraison;
create policy creneaux_select on livreur.creneaux_livraison
  for select to authenticated
  using (livreur_id = auth.uid() or livreur.is_admin_or_vendeur());

drop policy if exists creneaux_modify on livreur.creneaux_livraison;
create policy creneaux_modify on livreur.creneaux_livraison
  for all to authenticated
  using       (livreur_id = auth.uid() or livreur.is_admin_or_vendeur())
  with check  (livreur_id = auth.uid() or livreur.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. signatures_electroniques
-- ─────────────────────────────────────────────────────────────────────────────
-- Direct table access is INTERNAL ONLY. The public signature page uses
-- livreur.submit_signature() / livreur.get_signature_public() — both
-- SECURITY DEFINER, both granted to anon explicitly in 006.
drop policy if exists sig_select_internal on livreur.signatures_electroniques;
create policy sig_select_internal on livreur.signatures_electroniques
  for select to authenticated
  using (
    livreur.is_admin_or_vendeur()
    or exists (
      select 1 from livreur.bons_livraison bl
       where bl.id = signatures_electroniques.bl_id and bl.livreur_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated → table is read-only
-- through PostgREST. All writes go through the RPCs in 006.


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. driver_locations
-- ─────────────────────────────────────────────────────────────────────────────
-- Drivers insert their own GPS pings; everyone reads their own; admins read all.
drop policy if exists dl_select on livreur.driver_locations;
create policy dl_select on livreur.driver_locations
  for select to authenticated
  using (driver_id = auth.uid() or livreur.is_admin_or_vendeur());

drop policy if exists dl_insert on livreur.driver_locations;
create policy dl_insert on livreur.driver_locations
  for insert to authenticated
  with check (driver_id = auth.uid());

-- No UPDATE/DELETE (immutable telemetry; purged by purge_old_driver_locations).


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- Each user only sees their own. Updates limited to read_at. Inserts are
-- mostly server-side via RPCs / triggers, but authenticated may insert too
-- (e.g. system notifications from a vendeur action).
drop policy if exists notif_select on livreur.notifications;
create policy notif_select on livreur.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notif_update on livreur.notifications;
create policy notif_update on livreur.notifications
  for update to authenticated
  using       (user_id = auth.uid())
  with check  (user_id = auth.uid());

drop policy if exists notif_insert on livreur.notifications;
create policy notif_insert on livreur.notifications
  for insert to authenticated
  with check (true);  -- anyone can post notifs; spam-prevention is RPC-side


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. push_subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
-- Each user manages their own devices.
drop policy if exists push_modify on livreur.push_subscriptions;
create policy push_modify on livreur.push_subscriptions
  for all to authenticated
  using       (user_id = auth.uid())
  with check  (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. bl_attempt_log
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists attempt_select on livreur.bl_attempt_log;
create policy attempt_select on livreur.bl_attempt_log
  for select to authenticated
  using (livreur_id = auth.uid() or livreur.is_admin_or_vendeur());

drop policy if exists attempt_insert on livreur.bl_attempt_log;
create policy attempt_insert on livreur.bl_attempt_log
  for insert to authenticated
  with check (livreur_id = auth.uid() or livreur.is_admin_or_vendeur());

-- No UPDATE/DELETE (immutable audit log).


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. bl_status_history (read-only audit trail)
-- ─────────────────────────────────────────────────────────────────────────────
-- Inserts happen via the trg_log_bl_status_change trigger (SECURITY DEFINER)
-- so RLS doesn't apply to those writes. We only need a SELECT policy here.
drop policy if exists history_select on livreur.bl_status_history;
create policy history_select on livreur.bl_status_history
  for select to authenticated
  using (
    livreur.is_admin_or_vendeur()
    or exists (
      select 1 from livreur.bons_livraison bl
       where bl.id = bl_status_history.bl_id and bl.livreur_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Register this migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('005_livreur_rls.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Verification:
--
--    -- 1) RLS enabled on every table
--    select c.relname, c.relrowsecurity
--      from pg_class c
--      join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'livreur' and c.relkind = 'r'
--     order by c.relname;
--    -- expected: relrowsecurity = true everywhere
--
--    -- 2) All policies present
--    select schemaname, tablename, policyname, cmd, roles
--      from pg_policies
--     where schemaname = 'livreur'
--     order by tablename, cmd, policyname;
--
--    -- 3) Smoke test as anonymous (should return 0 rows for everything)
--    set local role anon;
--    select count(*) from livreur.profiles;     -- expected: error or 0
--    reset role;
-- ════════════════════════════════════════════════════════════════════════════
