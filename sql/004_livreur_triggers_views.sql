-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Triggers, Helpers & Views
-- ════════════════════════════════════════════════════════════════════════════
--
--  All in `livreur.*` schema. Idempotent (`create or replace`, `if not exists`).
--
--  ▸ updated_at triggers (use shared app_meta.set_updated_at)
--  ▸ business-logic triggers: numero_bl generation, frais re-livraison,
--    status history, last_assigned timestamping, creneau hours defaults
--  ▸ RLS helper functions: current_user_role, is_admin, is_admin_or_vendeur
--  ▸ utility functions: auto_assign_livreur, purge_old_driver_locations,
--    anonymize_client
--  ▸ views: v_bl_today, v_kpis_today, v_creneaux_semaine
--
--  Run AFTER: 003_livreur_schema.sql
--  Run BEFORE: 005_livreur_rls.sql (which depends on the helper functions)
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. updated_at triggers — use the shared helper from app_meta
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_updated_at' and tgrelid = 'livreur.profiles'::regclass) then
    create trigger trg_profiles_updated_at
      before update on livreur.profiles
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_clients_updated_at' and tgrelid = 'livreur.clients'::regclass) then
    create trigger trg_clients_updated_at
      before update on livreur.clients
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_commandes_updated_at' and tgrelid = 'livreur.commandes'::regclass) then
    create trigger trg_commandes_updated_at
      before update on livreur.commandes
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_bl_updated_at' and tgrelid = 'livreur.bons_livraison'::regclass) then
    create trigger trg_bl_updated_at
      before update on livreur.bons_livraison
      for each row execute function app_meta.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_creneaux_updated_at' and tgrelid = 'livreur.creneaux_livraison'::regclass) then
    create trigger trg_creneaux_updated_at
      before update on livreur.creneaux_livraison
      for each row execute function app_meta.set_updated_at();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS helper functions (used by 005_livreur_rls.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- These are SECURITY DEFINER so they bypass RLS on profiles when checking
-- the caller's role. Without that, profiles_select_own → recursion.
-- search_path is locked to livreur,public,pg_temp to prevent search_path
-- injection (Supabase security advisory).
create or replace function livreur.current_user_role()
returns livreur.user_role
language sql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
  select role from livreur.profiles where id = auth.uid();
$$;

comment on function livreur.current_user_role() is
  'Returns the role of the currently authenticated user, NULL if anon. '
  'SECURITY DEFINER to bypass RLS recursion on profiles.';

create or replace function livreur.is_admin()
returns boolean
language sql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
  select exists (
    select 1 from livreur.profiles
     where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

create or replace function livreur.is_admin_or_vendeur()
returns boolean
language sql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
  select exists (
    select 1 from livreur.profiles
     where id = auth.uid()
       and role in ('admin','vendeur','vendeur_proprietaire')
       and is_active = true
  );
$$;

create or replace function livreur.is_livreur()
returns boolean
language sql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
  select exists (
    select 1 from livreur.profiles
     where id = auth.uid() and role = 'livreur' and is_active = true
  );
$$;

-- Granted to authenticated so RLS policies can call them. Anon never needs
-- these (anon flow goes through SECURITY DEFINER RPCs in 006).
grant execute on function
  livreur.current_user_role(),
  livreur.is_admin(),
  livreur.is_admin_or_vendeur(),
  livreur.is_livreur()
to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. generate_numero_bl — DECO-BL-YYMMDD-XXXX auto-generation
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.generate_numero_bl()
returns trigger
language plpgsql
as $$
declare
  v_prefix text;
  v_suffix int;
begin
  if new.numero_bl is null or new.numero_bl = '' then
    v_prefix := 'DECO-BL-' || to_char(now(), 'YYMMDD') || '-';
    select coalesce(max(cast(split_part(numero_bl, '-', 4) as int)), 0) + 1
      into v_suffix
      from livreur.bons_livraison
     where numero_bl like v_prefix || '%';
    new.numero_bl := v_prefix || lpad(v_suffix::text, 4, '0');
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_auto_numero_bl' and tgrelid = 'livreur.bons_livraison'::regclass) then
    create trigger trg_auto_numero_bl
      before insert on livreur.bons_livraison
      for each row execute function livreur.generate_numero_bl();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. calculate_frais_relivraison — 5% surcharge on retry (RG-242b)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.calculate_frais_relivraison()
returns trigger
language plpgsql
as $$
begin
  if new.nb_tentatives >= 1 and new.admin_waiver = false then
    new.montant_frais_relivraison := round(new.montant_total_ttc * 0.05, 2);
  else
    new.montant_frais_relivraison := 0;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_frais_relivraison' and tgrelid = 'livreur.bons_livraison'::regclass) then
    create trigger trg_frais_relivraison
      before insert or update of nb_tentatives, admin_waiver, montant_total_ttc
      on livreur.bons_livraison
      for each row execute function livreur.calculate_frais_relivraison();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. log_bl_status_change — append to bl_status_history on every state move
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can write to bl_status_history regardless of the
-- triggering session's RLS posture.
create or replace function livreur.log_bl_status_change()
returns trigger
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.statut is distinct from new.statut then
    insert into livreur.bl_status_history (bl_id, ancien_statut, nouveau_statut, triggered_by, trigger_source)
    values (
      new.id, old.statut, new.statut, auth.uid(),
      case when auth.uid() is not null then 'user' else 'system' end
    );
  elsif tg_op = 'INSERT' then
    insert into livreur.bl_status_history (bl_id, ancien_statut, nouveau_statut, triggered_by, trigger_source)
    values (new.id, null, new.statut, auth.uid(), 'creation');
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_log_bl_status_change' and tgrelid = 'livreur.bons_livraison'::regclass) then
    create trigger trg_log_bl_status_change
      after insert or update on livreur.bons_livraison
      for each row execute function livreur.log_bl_status_change();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. update_livreur_last_assigned — bump profiles.last_assigned_at
-- ─────────────────────────────────────────────────────────────────────────────
-- Used by the auto-assignment algorithm to round-robin between drivers
-- with equal current load.
create or replace function livreur.update_livreur_last_assigned()
returns trigger
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
begin
  if new.livreur_id is not null
     and (old.livreur_id is null or old.livreur_id is distinct from new.livreur_id)
  then
    update livreur.profiles
       set last_assigned_at = now()
     where id = new.livreur_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_update_last_assigned' and tgrelid = 'livreur.bons_livraison'::regclass) then
    create trigger trg_update_last_assigned
      after insert or update of livreur_id on livreur.bons_livraison
      for each row execute function livreur.update_livreur_last_assigned();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. set_creneau_heures — default heure_debut/heure_fin from type_creneau
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.set_creneau_heures()
returns trigger
language plpgsql
as $$
begin
  if new.heure_debut is null or new.heure_fin is null then
    case new.type_creneau
      when 'matin'      then new.heure_debut := '09:00'; new.heure_fin := '12:00';
      when 'apres_midi' then new.heure_debut := '14:00'; new.heure_fin := '18:00';
      when 'soir'       then new.heure_debut := '18:00'; new.heure_fin := '20:00';
    end case;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_creneau_heures' and tgrelid = 'livreur.creneaux_livraison'::regclass) then
    create trigger trg_creneau_heures
      before insert or update on livreur.creneaux_livraison
      for each row execute function livreur.set_creneau_heures();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. auto_assign_livreur — pick the least-loaded available driver (RG-200+)
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the UUID of the livreur with:
--   1. role = 'livreur', is_active = true
--   2. weekly_schedule covers the target weekday (or empty schedule = always)
--   3. fewest in-flight BLs (assigne, confirme, en_livraison, en_route)
--   4. tie-breaker: oldest last_assigned_at
-- Returns NULL if no driver matches.
create or replace function livreur.auto_assign_livreur(p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_dow         text;
  v_livreur_id  uuid;
begin
  v_dow := lower(to_char(p_date, 'FMday'));
  select p.id
    into v_livreur_id
    from livreur.profiles p
   where p.role = 'livreur'
     and p.is_active = true
     and (
       p.weekly_schedule is null
       or p.weekly_schedule = '{}'::jsonb
       or p.weekly_schedule ? v_dow
     )
   order by (
     select count(*)
       from livreur.bons_livraison b
      where b.livreur_id = p.id
        and b.statut in ('assigne','confirme','release_demandee','en_livraison','en_route')
   ) asc,
     coalesce(p.last_assigned_at, '1970-01-01'::timestamptz) asc
   limit 1;
  return v_livreur_id;
end;
$$;

revoke all     on function livreur.auto_assign_livreur(date) from public;
grant  execute on function livreur.auto_assign_livreur(date) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. purge_old_driver_locations — 30-day rolling, daily cron
-- ─────────────────────────────────────────────────────────────────────────────
-- Hook this up via pg_cron (Supabase) — see README §"Scheduled jobs".
create or replace function livreur.purge_old_driver_locations()
returns int
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare v_deleted int;
begin
  delete from livreur.driver_locations
   where recorded_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function livreur.purge_old_driver_locations() is
  'Daily cron sweep: drop driver_locations rows older than 30 days. '
  'Schedule via pg_cron — see sql/README.md.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. anonymize_client — RGPD article 17 erasure
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.anonymize_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
begin
  if not livreur.is_admin() then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Only admins can anonymize a client (RGPD).';
  end if;

  update livreur.clients set
    nom                  = 'ANONYMIZED',
    prenom               = null,
    email                = null,
    telephone            = null,
    adresse_ligne1       = '[supprimée]',
    adresse_ligne2       = null,
    code_postal          = null,
    ville                = null,
    latitude             = null,
    longitude            = null,
    code_porte           = null,
    commentaire_acces    = null,
    shopify_customer_id  = null,
    anonymized_at        = now()
  where id = p_client_id;
end;
$$;

revoke all     on function livreur.anonymize_client(uuid) from public;
grant  execute on function livreur.anonymize_client(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Views — convenient projections for the PWA
-- ─────────────────────────────────────────────────────────────────────────────
-- Views inherit RLS from underlying tables (Postgres 15 default behaviour).
-- Filtered by auth.uid() so each driver only sees their own rows.

-- 11.1 BL of the day for the connected driver
create or replace view livreur.v_bl_today as
select
  bl.id, bl.numero_bl, bl.statut, bl.creneau, bl.date_livraison_prevue,
  bl.mode_livraison, bl.montant_total_ttc, bl.montant_frais_relivraison,
  bl.nb_tentatives,
  c.nom as client_nom, c.prenom as client_prenom, c.telephone as client_telephone,
  c.email as client_email, c.adresse_ligne1 as client_adresse,
  c.code_postal as client_cp, c.ville as client_ville,
  c.latitude as client_lat, c.longitude as client_lng,
  c.etage as client_etage, c.ascenseur as client_ascenseur,
  c.code_porte as client_code_porte, c.commentaire_acces as client_commentaire,
  cmd.numero_commande, cmd.date_commande,
  (
    select jsonb_agg(jsonb_build_object(
      'designation', l.designation,
      'marque',      l.marque,
      'modele',      l.modele,
      'quantite',    l.quantite,
      'fragile',     l.fragile,
      'poids_kg',    l.poids_kg,
      'volume_m3',   l.volume_m3
    ) order by l.ordre_tri)
    from livreur.lignes_bl l
    where l.bl_id = bl.id
  ) as articles
from livreur.bons_livraison bl
join livreur.clients   c   on c.id   = bl.client_id
join livreur.commandes cmd on cmd.id = bl.commande_id
where bl.livreur_id = auth.uid()
  and bl.date_livraison_prevue = current_date;

-- 11.2 KPIs for the connected driver
create or replace view livreur.v_kpis_today as
select
  livreur_id,
  count(*) filter (where date_livraison_prevue = current_date) as bl_aujourd_hui,
  count(*) filter (where statut = 'signe' and date(date_signature) = current_date) as livres_signes_today,
  count(*) filter (where statut in ('en_livraison','en_route') and date_livraison_prevue = current_date) as en_cours,
  count(*) filter (where statut in ('assigne','confirme','release_demandee') and date_livraison_prevue = current_date) as restant,
  round(
    100.0 * count(*) filter (where statut = 'signe' and date(date_signature) = current_date)
    / nullif(count(*) filter (where statut in ('signe','signature_expiree','livre') and date_livraison_prevue = current_date), 0),
    1
  ) as taux_signature_pct
from livreur.bons_livraison
where livreur_id is not null
group by livreur_id;

-- 11.3 Weekly slots for the connected driver
create or replace view livreur.v_creneaux_semaine as
select
  livreur_id, date_creneau, type_creneau, statut, bl_id,
  extract(dow from date_creneau) as day_of_week
from livreur.creneaux_livraison
where date_creneau between current_date and current_date + interval '7 days'
order by date_creneau, type_creneau;

-- View grants (table grants in 003 cover these too, but be explicit)
grant select on
  livreur.v_bl_today,
  livreur.v_kpis_today,
  livreur.v_creneaux_semaine
to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Performance indexes (kept here so 003 stays focused on shape)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_profiles_active_role
  on livreur.profiles (role) where is_active = true;
create index if not exists idx_profiles_active_livreurs
  on livreur.profiles (role) where role = 'livreur' and is_active = true;

create index if not exists idx_clients_email
  on livreur.clients (email) where email is not null;
create index if not exists idx_clients_shopify
  on livreur.clients (shopify_customer_id) where shopify_customer_id is not null;
create index if not exists idx_clients_geo
  on livreur.clients (latitude, longitude) where latitude is not null;

create index if not exists idx_commandes_client     on livreur.commandes (client_id);
create index if not exists idx_commandes_shopify    on livreur.commandes (shopify_order_id);
create index if not exists idx_commandes_statut     on livreur.commandes (statut, date_commande desc);

create index if not exists idx_bl_livreur     on livreur.bons_livraison (livreur_id, statut);
create index if not exists idx_bl_vendeur     on livreur.bons_livraison (vendeur_id);
create index if not exists idx_bl_client      on livreur.bons_livraison (client_id);
create index if not exists idx_bl_commande    on livreur.bons_livraison (commande_id);
create index if not exists idx_bl_statut      on livreur.bons_livraison (statut);
create index if not exists idx_bl_date_creneau
  on livreur.bons_livraison (date_livraison_prevue, creneau);
create index if not exists idx_bl_today_per_driver
  on livreur.bons_livraison (livreur_id, date_livraison_prevue)
  where statut in ('confirme','release_demandee','en_livraison','en_route');

create index if not exists idx_lignes_bl_bl
  on livreur.lignes_bl (bl_id);
create index if not exists idx_lignes_bl_article
  on livreur.lignes_bl (article_id) where article_id is not null;

create index if not exists idx_creneaux_livreur_date
  on livreur.creneaux_livraison (livreur_id, date_creneau);
create index if not exists idx_creneaux_disponibles
  on livreur.creneaux_livraison (date_creneau, type_creneau)
  where statut = 'disponible';
create index if not exists idx_creneaux_bl
  on livreur.creneaux_livraison (bl_id) where bl_id is not null;

create index if not exists idx_signatures_token
  on livreur.signatures_electroniques (token);
create index if not exists idx_signatures_status
  on livreur.signatures_electroniques (statut);
create index if not exists idx_signatures_expiration
  on livreur.signatures_electroniques (date_expiration) where statut = 'en_attente';
create index if not exists idx_signatures_signed_at
  on livreur.signatures_electroniques (date_signature) where statut = 'signe';

create index if not exists idx_driver_loc_recent
  on livreur.driver_locations (driver_id, recorded_at desc);
create index if not exists idx_driver_loc_bl
  on livreur.driver_locations (bl_id, recorded_at desc) where bl_id is not null;

create index if not exists idx_notif_user_unread
  on livreur.notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_notif_user_all
  on livreur.notifications (user_id, created_at desc);

create index if not exists idx_push_user
  on livreur.push_subscriptions (user_id) where is_active = true;

create index if not exists idx_attempt_bl
  on livreur.bl_attempt_log (bl_id, recorded_at desc);
create index if not exists idx_attempt_livreur
  on livreur.bl_attempt_log (livreur_id, recorded_at desc);

create index if not exists idx_status_history_bl
  on livreur.bl_status_history (bl_id, changed_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Register this migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('004_livreur_triggers_views.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Verification:
--
--    -- 1) Helper functions callable
--    select livreur.current_user_role();    -- NULL when run as anon
--    select livreur.is_admin();              -- false
--    select livreur.is_admin_or_vendeur();   -- false
--
--    -- 2) Triggers attached
--    select tgname, tgrelid::regclass from pg_trigger
--     where tgrelid::regclass::text like 'livreur.%' and not tgisinternal
--     order by tgname;
--
--    -- 3) Views queryable (will be empty until rows + auth)
--    select count(*) from livreur.v_bl_today;
--    select count(*) from livreur.v_kpis_today;
--
--    -- 4) public.articles still untouched
--    select count(*) from public.articles;
-- ════════════════════════════════════════════════════════════════════════════
