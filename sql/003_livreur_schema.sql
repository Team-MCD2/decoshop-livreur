-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Schema  (additive, schema-isolated)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Adds the delivery / signature platform in its OWN schema (`livreur.*`)
--  so it cannot collide with `public.*` (inventory) or `plan.*` (floor plan)
--  and can be reverted cleanly with `drop schema livreur cascade`.
--
--  ▸ IDEMPOTENT  — safe to re-run; uses IF NOT EXISTS / ON CONFLICT.
--  ▸ ADDITIVE    — never ALTERs or DROPs existing tables outside livreur.*.
--  ▸ NON-INVASIVE on `public.articles` — only referenced via FK from
--                  `livreur.lignes_bl.article_id` with `on delete set null`.
--
--  Run AFTER:
--    decoshop-plan-v2/sql/000_common.sql   (provides app_meta + _migrations)
--
--  Run order within this folder:
--    003_livreur_schema.sql            ← THIS FILE
--    004_livreur_triggers_views.sql    (helpers + triggers + views)
--    005_livreur_rls.sql               (RLS policies)
--    006_livreur_signature_rpcs.sql    (signature flow RPCs)
--    007_livreur_storage.sql           (storage buckets + bucket RLS)
--
-- ─── Schema layout ──────────────────────────────────────────────────────────
--    livreur.profiles                 (extends auth.users)
--    livreur.clients                  (delivery recipients)
--    livreur.commandes                (orders)
--    livreur.bons_livraison           (delivery notes — central pivot)
--    livreur.lignes_bl                (BL lines, optional FK to articles)
--    livreur.creneaux_livraison       (driver time slots)
--    livreur.signatures_electroniques (10-min signature tokens)
--    livreur.driver_locations         (GPS tracking, 30-day rolling)
--    livreur.notifications            (in-app feed)
--    livreur.push_subscriptions       (web push, multi-device)
--    livreur.bl_attempt_log           (failed delivery attempts, analytics)
--    livreur.bl_status_history        (audit trail)
--
--  ⚠ Supabase config requirement: add `livreur` to "Exposed schemas" so the
--  PWA can call `supabase.from('livreur.…')` and `supabase.schema('livreur')
--  .rpc(…)` via PostgREST. See Supabase Studio → Settings → API.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Schema namespace + extensions
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists livreur;

comment on schema livreur is
  'DecoShop Livreur — delivery platform. Owned by decoshop-livreur PWA.';

-- USAGE for authenticated (the PWA logs users in via Supabase Auth) plus
-- anon for the public signature page (/sign/:token). Table-level GRANTs
-- below restrict actual ops; RLS gates rows.
grant usage on schema livreur to anon, authenticated;

-- Extensions (idempotent; may already be enabled by another migration)
create extension if not exists pgcrypto;       -- gen_random_bytes / gen_random_uuid
create extension if not exists pg_trgm;        -- fuzzy search on clients
create extension if not exists btree_gist;     -- range constraints (creneaux)


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMs — all in livreur.* schema for full isolation
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type livreur.user_role as enum ('admin','vendeur','vendeur_proprietaire','livreur');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.order_status as enum ('en_attente','en_preparation','expediee','livree','annulee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.bl_status as enum (
    'cree','assigne','confirme','release_demandee','bloque',
    'en_livraison','en_route','livre','signature_attendue','signe',
    'signature_expiree','echec_T1','echec_T2','abandon',
    'retour_planifie','retour_en_cours','retour_collecte'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.signature_status as enum ('en_attente','signe','expire');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.delivery_mode as enum ('domicile','retrait_magasin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.creneau_type as enum ('matin','apres_midi','soir');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.slot_status as enum ('disponible','reserve','termine','annule');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.vehicle_type as enum ('voiture','utilitaire','camionnette','camion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.attempt_failure_reason as enum (
    'client_absent','client_refuse','adresse_introuvable','articles_endommages',
    'colis_perdu','meteo','panne_vehicule','autre'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type livreur.notification_type as enum (
    'bl_assigned','bl_creneau_confirmed','bl_release_requested','bl_release_validated',
    'bl_release_rejected','bl_delivered','bl_signed','bl_signature_expired',
    'bl_attempt_failed','system_alert'
  );
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles — extends auth.users, holds business identity + livreur metadata
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.profiles (
  id                       uuid                  primary key references auth.users(id) on delete cascade,
  nom                      text,
  prenom                   text,
  telephone                text,
  email                    text,
  role                     livreur.user_role     not null default 'vendeur',
  is_active                boolean               not null default true,
  vehicle_type             livreur.vehicle_type,
  vehicle_capacity_m3      numeric(5, 2),
  vehicle_immatriculation  text,
  weekly_schedule          jsonb                          default '{}'::jsonb,
  last_assigned_at         timestamptz,
  pin_hash                 text,
  preferred_language       text                           default 'fr'
                                                          check (preferred_language in ('fr','ar')),
  push_subscription        jsonb,
  zones_couvertes          text[],
  avatar_url               text,
  created_at               timestamptz           not null default now(),
  updated_at               timestamptz           not null default now()
);

comment on table livreur.profiles is
  'Internal users (admin, vendeur, livreur). Mirrors auth.users via id FK.';
comment on column livreur.profiles.weekly_schedule is
  'Driver weekly availability (RG-201). JSONB keyed by lowercase weekday: '
  '{ "monday": [...], "tuesday": [...] }.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. clients — delivery recipients (Shopify-synced or manual)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.clients (
  id                   uuid          primary key default gen_random_uuid(),
  nom                  text          not null,
  prenom               text,
  email                text,
  telephone            text,
  adresse_ligne1       text          not null,
  adresse_ligne2       text,
  code_postal          text,
  ville                text,
  pays                 text                   default 'France',
  latitude             numeric(10, 7),
  longitude            numeric(10, 7),
  etage                int,
  ascenseur            boolean,
  code_porte           text,
  commentaire_acces    text,
  shopify_customer_id  text,
  anonymized_at        timestamptz,
  created_at           timestamptz   not null  default now(),
  updated_at           timestamptz   not null  default now()
);

comment on table livreur.clients is
  'Delivery recipients. anonymized_at is set by livreur.anonymize_client() (RGPD).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. commandes — sales orders (one BL per order, generally)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.commandes (
  id                  uuid                  primary key default gen_random_uuid(),
  client_id           uuid                  not null references livreur.clients(id) on delete restrict,
  numero_commande     text                  not null unique,
  shopify_order_id    text                  unique,
  statut              livreur.order_status  not null default 'en_attente',
  montant_total_ttc   numeric(10, 2)        not null,
  montant_total_ht    numeric(10, 2),
  montant_tva         numeric(10, 2),
  taux_tva            numeric(4, 2)                   default 20.00,
  date_commande       timestamptz           not null default now(),
  notes               text,
  created_at          timestamptz           not null default now(),
  updated_at          timestamptz           not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. bons_livraison — central pivot of the delivery flow
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.bons_livraison (
  id                          uuid                   primary key default gen_random_uuid(),
  numero_bl                   text                   not null unique,
  commande_id                 uuid                   not null references livreur.commandes(id) on delete restrict,
  client_id                   uuid                   not null references livreur.clients(id)   on delete restrict,
  vendeur_id                  uuid                            references livreur.profiles(id)   on delete set null,
  livreur_id                  uuid                            references livreur.profiles(id)   on delete set null,
  statut                      livreur.bl_status      not null default 'cree',
  mode_livraison              livreur.delivery_mode  not null default 'domicile',
  creneau                     livreur.creneau_type,
  date_livraison_prevue       date,
  date_livraison_effective    timestamptz,
  montant_total_ttc           numeric(10, 2)         not null,
  montant_frais_relivraison   numeric(10, 2)                  default 0,
  nb_tentatives               int                    not null default 0 check (nb_tentatives >= 0),
  admin_waiver                boolean                not null default false,
  attempt_log                 jsonb                  not null default '[]'::jsonb,
  assignment_log              jsonb                  not null default '[]'::jsonb,
  release_requested_at        timestamptz,
  release_validated_at        timestamptz,
  release_validated_by        uuid                            references livreur.profiles(id)   on delete set null,
  release_rejected_motif      text,
  photo_depart_url            text,
  vendeur_present_depart      boolean                         default true,
  photo_litige_url            text,
  pdf_url                     text,
  date_creation               timestamptz            not null default now(),
  date_signature              timestamptz,
  created_at                  timestamptz            not null default now(),
  updated_at                  timestamptz            not null default now()
);

comment on table livreur.bons_livraison is
  'Bon de livraison (BL) — central pivot of the delivery workflow.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. lignes_bl — BL line items (with optional FK to public.articles)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.lignes_bl (
  id                  uuid            primary key default gen_random_uuid(),
  bl_id               uuid            not null references livreur.bons_livraison(id) on delete cascade,
  -- article_id is `text` to match public.articles.id (Shopify-style ids,
  -- not uuids). FK wired below, defensively, after type check.
  article_id          text,
  designation         text            not null,
  marque              text,
  modele              text,
  quantite            int             not null default 1 check (quantite > 0),
  prix_unitaire_ttc   numeric(10, 2)  not null,
  total_ligne_ttc     numeric(10, 2)  generated always as (quantite * prix_unitaire_ttc) stored,
  poids_kg            numeric(6, 2),
  volume_m3           numeric(6, 3),
  fragile             boolean                  default false,
  ordre_tri           int                      default 0,
  created_at          timestamptz     not null default now()
);

comment on column livreur.lignes_bl.article_id is
  'Optional FK to public.articles. Coerced to NULL on article delete (denormalised '
  'designation / marque / modele / prix_unitaire_ttc preserve audit history).';

-- Add the FK to public.articles, defensively. Idempotent + non-fatal.
-- Same pattern as plan-v2's 001_plan_tables.sql: if the inventory app ever
-- migrates articles.id to uuid, update this column type and re-run.
do $$
declare v_target_type text;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'articles'
  ) then
    raise notice 'public.articles not found — skipping lignes_bl.article_id FK.';
    return;
  end if;

  select data_type into v_target_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'articles' and column_name = 'id';

  -- FK source is `text`. Compatible target types: text, character varying.
  if v_target_type not in ('text', 'character varying') then
    raise notice
      'public.articles.id is % (expected text) — skipping lignes_bl.article_id FK. '
      'Either migrate articles.id to text, or update livreur.lignes_bl.article_id '
      'type in 003_livreur_schema.sql to match.',
      v_target_type;
    return;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'lignes_bl_article_id_fkey'
       and conrelid = 'livreur.lignes_bl'::regclass
  ) then
    alter table livreur.lignes_bl
      add constraint lignes_bl_article_id_fkey
      foreign key (article_id) references public.articles(id) on delete set null;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. creneaux_livraison — driver time slots (1 per livreur per day per type)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.creneaux_livraison (
  id              uuid                  primary key default gen_random_uuid(),
  livreur_id      uuid                  not null references livreur.profiles(id) on delete cascade,
  date_creneau    date                  not null,
  type_creneau    livreur.creneau_type  not null,
  heure_debut     time                  not null,
  heure_fin       time                  not null,
  statut          livreur.slot_status   not null default 'disponible',
  bl_id           uuid                            references livreur.bons_livraison(id) on delete set null,
  notes           text,
  created_at      timestamptz           not null default now(),
  updated_at      timestamptz           not null default now(),
  constraint creneaux_unique_per_livreur unique (livreur_id, date_creneau, type_creneau)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. signatures_electroniques — 10-minute signature tokens
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.signatures_electroniques (
  id                 uuid                       primary key default gen_random_uuid(),
  bl_id              uuid                       not null unique references livreur.bons_livraison(id) on delete cascade,
  token              text                       not null unique,
  email_client       text                       not null,
  statut             livreur.signature_status   not null default 'en_attente',
  signature_data     text,
  signature_png_url  text,
  signe_par_parent   boolean                             default false,
  parent_nom         text,
  parent_lien        text,
  client_ip          inet,
  user_agent         text,
  retry_count        int                        not null default 0,
  date_emission      timestamptz                not null default now(),
  date_expiration    timestamptz                not null,
  date_signature     timestamptz,
  constraint signatures_valid_expiration check (date_expiration > date_emission)
);

comment on table livreur.signatures_electroniques is
  'Single signature row per BL (UNIQUE bl_id). Token is 64 hex chars from '
  'gen_random_bytes(32); see livreur.request_signature() in 006.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. driver_locations — GPS breadcrumb trail (30-day rolling, purged daily)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.driver_locations (
  id           uuid           primary key default gen_random_uuid(),
  driver_id    uuid           not null references livreur.profiles(id) on delete cascade,
  bl_id        uuid                    references livreur.bons_livraison(id) on delete set null,
  lat          numeric(10, 7) not null  check (lat between -90 and 90),
  lng          numeric(10, 7) not null  check (lng between -180 and 180),
  accuracy_m   int,
  heading_deg  numeric(5, 2),
  speed_kmh    numeric(5, 2),
  recorded_at  timestamptz    not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. notifications — in-app feed (read by user, filtered by user_id)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.notifications (
  id          uuid                       primary key default gen_random_uuid(),
  user_id     uuid                       not null references livreur.profiles(id) on delete cascade,
  type        livreur.notification_type  not null,
  title       text                       not null,
  body        text,
  link        text,
  bl_id       uuid                                references livreur.bons_livraison(id) on delete cascade,
  metadata    jsonb                               default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz                not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. push_subscriptions — Web Push endpoints (multi-device per user)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.push_subscriptions (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         not null references livreur.profiles(id) on delete cascade,
  endpoint      text         not null unique,
  p256dh        text         not null,
  auth          text         not null,
  user_agent    text,
  device_label  text,
  is_active     boolean      not null default true,
  last_used_at  timestamptz,
  created_at    timestamptz  not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. bl_attempt_log — analytics on failed deliveries
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.bl_attempt_log (
  id                 uuid                              primary key default gen_random_uuid(),
  bl_id              uuid                              not null references livreur.bons_livraison(id) on delete cascade,
  livreur_id         uuid                                       references livreur.profiles(id) on delete set null,
  numero_tentative   int                               not null,
  motif              livreur.attempt_failure_reason    not null,
  commentaire        text,
  photo_litige_url   text,
  latitude           numeric(10, 7),
  longitude          numeric(10, 7),
  recorded_at        timestamptz                       not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. bl_status_history — append-only audit trail of every BL state change
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists livreur.bl_status_history (
  id              uuid               primary key default gen_random_uuid(),
  bl_id           uuid               not null references livreur.bons_livraison(id) on delete cascade,
  ancien_statut   livreur.bl_status,
  nouveau_statut  livreur.bl_status  not null,
  triggered_by    uuid                        references livreur.profiles(id) on delete set null,
  trigger_source  text,
  metadata        jsonb                       default '{}'::jsonb,
  changed_at      timestamptz        not null default now()
);

comment on table livreur.bl_status_history is
  'Append-only audit trail. Populated by trigger trg_log_bl_status_change in 004.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Table-level grants (RLS still gates the rows; see 005)
-- ─────────────────────────────────────────────────────────────────────────────
-- Granted to authenticated only — anon access for the public signature page
-- happens via SECURITY DEFINER RPCs in 006, not direct table reads.
grant select, insert, update, delete on
  livreur.profiles,
  livreur.clients,
  livreur.commandes,
  livreur.bons_livraison,
  livreur.lignes_bl,
  livreur.creneaux_livraison,
  livreur.signatures_electroniques,
  livreur.driver_locations,
  livreur.notifications,
  livreur.push_subscriptions,
  livreur.bl_attempt_log,
  livreur.bl_status_history
to authenticated;

-- Sequence grants — none needed: all PKs use uuid defaults, no sequences.


-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Register this migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('003_livreur_schema.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Verification:
--
--    -- 1) livreur schema exists
--    select schema_name from information_schema.schemata where schema_name = 'livreur';
--
--    -- 2) All 12 tables present
--    select table_name from information_schema.tables
--     where table_schema = 'livreur' order by table_name;
--    -- expected: bl_attempt_log, bl_status_history, bons_livraison, clients,
--    --           commandes, creneaux_livraison, driver_locations, lignes_bl,
--    --           notifications, profiles, push_subscriptions,
--    --           signatures_electroniques
--
--    -- 3) FK from lignes_bl to articles wired
--    select conname, conrelid::regclass, confrelid::regclass
--      from pg_constraint where conname = 'lignes_bl_article_id_fkey';
--
--    -- 4) public.articles still untouched
--    select count(*) from public.articles;
-- ════════════════════════════════════════════════════════════════════════════
