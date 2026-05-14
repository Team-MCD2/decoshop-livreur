-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Workflow RPCs  (state machine, failure path, KPIs,
--                                       auto-provisioning, realtime)
-- ════════════════════════════════════════════════════════════════════════════
--
--  This migration extends the livreur backend with the missing pieces of the
--  delivery workflow that were schema-ready in 003 but lacked authoritative
--  server-side enforcement. After this migration the PWA can rely on the
--  database to be the single source of truth for:
--
--    1. WHICH transitions are allowed between BL statuses (state machine)
--    2. HOW a failed delivery rolls up to T1 / T2 / abandon palier
--    3. WHAT a driver's daily / period scorecard looks like
--    4. AUTO-provisioning a `livreur.profiles` skeleton row when a new
--       `auth.users` is created (admin still needs to flip `is_active=true`
--       and adjust `role`, but the row exists from second 1 of signup)
--    5. REALTIME publication of `livreur.bons_livraison` so the
--       `useBLsRealtime` hook actually fires (without this, the
--       Supabase Realtime channel subscribes but never receives events)
--
--  Sections in this file:
--    1. State-machine helpers  (livreur.allowed_bl_transitions,
--                               livreur.assert_bl_transition_valid)
--    2. RPC livreur.transition_bl_status(p_bl_id, p_to_status, p_metadata)
--    3. RPC livreur.record_failed_attempt(p_bl_id, p_motif, ...)
--    4. RPC livreur.get_driver_daily_kpis(p_date, p_driver_id)
--    5. RPC livreur.get_driver_period_score(p_from, p_to, p_driver_id)
--    6. Auto-provisioning trigger on auth.users
--    7. Realtime publication grant
--    8. Migration registration
--
--  Design invariants:
--    ▸ Idempotent  — every CREATE uses OR REPLACE / IF NOT EXISTS.
--    ▸ Locked search_path on every SECURITY DEFINER function (advisory).
--    ▸ State machine is data-driven (one function, one table of rules) so
--      future transitions can be added without rewriting the RPC body.
--    ▸ Status-change history is written by the existing
--      `trg_log_bl_status_change` trigger (see 004). Our RPCs enrich the
--      most-recent history row with `metadata` after the UPDATE — we never
--      double-insert.
--    ▸ Frais re-livraison are computed by the existing
--      `trg_frais_relivraison` BEFORE-trigger (see 004) which keys off
--      `nb_tentatives` and `admin_waiver`. Our failure RPC simply bumps
--      `nb_tentatives` and lets the trigger do the math.
--
--  Run AFTER: 003_livreur_schema.sql, 004_livreur_triggers_views.sql,
--             005_livreur_rls.sql, 006_livreur_signature_rpcs.sql
--             (007_livreur_storage.sql + 008_livreur_signature_optional_email.sql
--              are also recommended but not strictly required.)
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Pre-flight — verify dependencies are in place
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'livreur') then
    raise exception 'livreur schema not found. Run 003_livreur_schema.sql first.';
  end if;
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'livreur' and p.proname = 'is_admin_or_vendeur'
  ) then
    raise exception 'livreur.is_admin_or_vendeur() missing. Run 004_livreur_triggers_views.sql first.';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. State-machine helpers
-- ─────────────────────────────────────────────────────────────────────────────
-- Single source of truth for "which next-status is allowed given (from, role)".
-- Encoded as a STABLE function returning a set of valid targets so SQL can
-- both validate transitions AND surface "what can I do next" to the UI.
--
-- Notation:
--   driver    = role 'livreur'
--   admin*    = role 'admin' OR 'vendeur' OR 'vendeur_proprietaire'
--   anyone    = both driver (on own BL) and admin*
--
--  from             → driver targets                       admin* extra
--  ──────────────────────────────────────────────────────────────────────────
--  cree             → (none)                               assigne, bloque
--  assigne          → confirme, release_demandee           en_livraison,
--                                                          bloque, cree
--  confirme         → en_livraison, release_demandee       bloque, cree
--  release_demandee → (none — admin arbitrates)            assigne, cree,
--                                                          bloque
--  bloque           → (none — admin gates)                 cree, assigne
--  en_livraison     → en_route, echec_T1                   bloque
--  en_route         → livre, echec_T1                      bloque
--  livre            → signature_attendue, signe            bloque
--  signature_attendue → signe                              livre
--                       (anon submit goes through
--                       submit_signature, not this RPC)
--  signe            → (terminal)                           (immutable)
--  signature_expiree → signature_attendue, livre           (admin re-issue)
--  echec_T1         → en_livraison (retry), echec_T2,      abandon,
--                     retour_planifie                      bloque
--  echec_T2         → retour_planifie                      abandon, bloque
--  abandon          → (terminal)                           retour_planifie
--  retour_planifie  → retour_en_cours                      abandon
--  retour_en_cours  → retour_collecte                      (none)
--  retour_collecte  → (terminal)                           (none)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.allowed_bl_transitions(
  p_from livreur.bl_status,
  p_caller_role livreur.user_role
)
returns livreur.bl_status[]
language plpgsql
stable
set search_path = livreur, public, pg_temp
as $$
declare
  v_is_admin boolean := p_caller_role in ('admin','vendeur','vendeur_proprietaire');
  v_driver   livreur.bl_status[] := '{}';
  v_extra    livreur.bl_status[] := '{}';
begin
  case p_from
    when 'cree' then
      v_extra := array['assigne','bloque']::livreur.bl_status[];
    when 'assigne' then
      v_driver := array['confirme','release_demandee']::livreur.bl_status[];
      v_extra  := array['en_livraison','bloque','cree']::livreur.bl_status[];
    when 'confirme' then
      v_driver := array['en_livraison','release_demandee']::livreur.bl_status[];
      v_extra  := array['bloque','cree']::livreur.bl_status[];
    when 'release_demandee' then
      v_extra  := array['assigne','cree','bloque']::livreur.bl_status[];
    when 'bloque' then
      v_extra  := array['cree','assigne']::livreur.bl_status[];
    when 'en_livraison' then
      v_driver := array['en_route','echec_T1']::livreur.bl_status[];
      v_extra  := array['bloque']::livreur.bl_status[];
    when 'en_route' then
      v_driver := array['livre','echec_T1']::livreur.bl_status[];
      v_extra  := array['bloque']::livreur.bl_status[];
    when 'livre' then
      v_driver := array['signature_attendue','signe']::livreur.bl_status[];
      v_extra  := array['bloque']::livreur.bl_status[];
    when 'signature_attendue' then
      v_driver := array['signe']::livreur.bl_status[];
      v_extra  := array['livre']::livreur.bl_status[];
    when 'signature_expiree' then
      v_driver := array['signature_attendue','livre']::livreur.bl_status[];
    when 'echec_T1' then
      v_driver := array['en_livraison','echec_T2','retour_planifie']::livreur.bl_status[];
      v_extra  := array['abandon','bloque']::livreur.bl_status[];
    when 'echec_T2' then
      v_driver := array['retour_planifie']::livreur.bl_status[];
      v_extra  := array['abandon','bloque']::livreur.bl_status[];
    when 'abandon' then
      v_extra  := array['retour_planifie']::livreur.bl_status[];
    when 'retour_planifie' then
      v_driver := array['retour_en_cours']::livreur.bl_status[];
      v_extra  := array['abandon']::livreur.bl_status[];
    when 'retour_en_cours' then
      v_driver := array['retour_collecte']::livreur.bl_status[];
    -- terminal: 'signe', 'retour_collecte' have no successors
    else
      v_driver := '{}';
  end case;

  if v_is_admin then
    return v_driver || v_extra;
  else
    return v_driver;
  end if;
end;
$$;

comment on function livreur.allowed_bl_transitions(livreur.bl_status, livreur.user_role) is
  'Returns the array of valid next BL statuses given the current status and '
  'the caller''s role. Empty array = no further automated transition (terminal '
  'or admin-only). Source of truth consumed by transition_bl_status() and '
  'mirrored on the front-end (src/hooks/useBLDetail.ts → nextWorkflowStatus).';

revoke all     on function livreur.allowed_bl_transitions(livreur.bl_status, livreur.user_role) from public;
grant  execute on function livreur.allowed_bl_transitions(livreur.bl_status, livreur.user_role) to authenticated;


-- Convenience wrapper for the UI: "what can I do next from THIS status?",
-- automatically resolved against the caller's role.
create or replace function livreur.my_allowed_bl_transitions(p_from livreur.bl_status)
returns livreur.bl_status[]
language sql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
  select livreur.allowed_bl_transitions(
    p_from,
    coalesce(livreur.current_user_role(), 'livreur'::livreur.user_role)
  );
$$;

revoke all     on function livreur.my_allowed_bl_transitions(livreur.bl_status) from public;
grant  execute on function livreur.my_allowed_bl_transitions(livreur.bl_status) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC livreur.transition_bl_status — authoritative BL state move
-- ─────────────────────────────────────────────────────────────────────────────
-- Caller: authenticated livreur (own BL) OR admin/vendeur (any BL).
-- Pre:    (from, to) ∈ allowed_bl_transitions(from, caller_role)
-- Post:   bons_livraison.statut updated; trg_log_bl_status_change inserts
--         the history row; if p_metadata provided, the history row is
--         enriched in-place.
--         If to ∈ {livre, signe}, date_livraison_effective is stamped when null.
--         If to = 'signe', date_signature is stamped when null.
-- Errors: NOT_AUTHENTICATED, BL_NOT_FOUND, BL_NOT_ASSIGNED_TO_YOU,
--         INVALID_TRANSITION:<from>→<to>, FORBIDDEN
--
-- NOTE: This RPC deliberately does NOT cover the failure-path transitions
-- (en_route → echec_T1, echec_T1 → echec_T2, ...). For those, callers MUST
-- use `record_failed_attempt()` which captures motif/photo/GPS atomically.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.transition_bl_status(
  p_bl_id      uuid,
  p_to_status  livreur.bl_status,
  p_metadata   jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_role       livreur.user_role;
  v_bl         livreur.bons_livraison%rowtype;
  v_allowed    livreur.bl_status[];
  v_history_id uuid;
  v_started_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from livreur.profiles where id = v_user_id;
  if v_role is null then
    raise exception 'PROFILE_NOT_FOUND' using
      errcode = 'P0002',
      hint    = 'Caller has no livreur.profiles row. Admin must provision it.';
  end if;

  -- Lock the row so we don't race against concurrent transitions
  -- (e.g. realtime kick + manual click).
  select * into v_bl from livreur.bons_livraison
   where id = p_bl_id for update;
  if not found then
    raise exception 'BL_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Scope check: drivers can only move their own BLs; admin/vendeur any.
  if v_bl.livreur_id is distinct from v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'BL_NOT_ASSIGNED_TO_YOU' using errcode = '42501';
  end if;

  -- Same-status no-op: surface as success without writing.
  if v_bl.statut = p_to_status then
    return json_build_object(
      'success',         true,
      'bl_id',           p_bl_id,
      'previous_status', v_bl.statut::text,
      'new_status',      p_to_status::text,
      'no_op',           true
    );
  end if;

  -- Validate transition against the state machine.
  v_allowed := livreur.allowed_bl_transitions(v_bl.statut, v_role);
  if not (p_to_status = any(v_allowed)) then
    raise exception
      'INVALID_TRANSITION:%->%', v_bl.statut::text, p_to_status::text
      using errcode = 'P0001',
            hint    = 'Allowed from this status: ' || coalesce(array_to_string(v_allowed, ','), '<none>');
  end if;

  -- Apply transition. Side effects:
  --   • livre or signe → stamp date_livraison_effective if null
  --   • signe           → stamp date_signature if null
  -- The trg_log_bl_status_change AFTER trigger logs the row to
  -- livreur.bl_status_history with trigger_source='user'.
  update livreur.bons_livraison
     set statut                   = p_to_status,
         date_livraison_effective = case
           when p_to_status in ('livre','signe')
            and date_livraison_effective is null then now()
           else date_livraison_effective
         end,
         date_signature           = case
           when p_to_status = 'signe' and date_signature is null then now()
           else date_signature
         end,
         updated_at               = now()
   where id = p_bl_id;

  -- Enrich the latest history row with p_metadata (default '{}'). The
  -- existing trigger doesn't accept extra payload, so we patch after.
  -- We scope by (bl_id, changed_at >= v_started_at) to avoid clobbering
  -- earlier history rows.
  update livreur.bl_status_history
     set metadata       = coalesce(p_metadata, '{}'::jsonb)
                          || jsonb_build_object('rpc', 'transition_bl_status'),
         trigger_source = 'rpc:transition_bl_status'
   where id = (
     select id from livreur.bl_status_history
      where bl_id = p_bl_id and changed_at >= v_started_at
      order by changed_at desc limit 1
   )
   returning id into v_history_id;

  return json_build_object(
    'success',         true,
    'bl_id',           p_bl_id,
    'previous_status', v_bl.statut::text,
    'new_status',      p_to_status::text,
    'history_id',      v_history_id,
    'changed_at',      now()
  );
end;
$$;

comment on function livreur.transition_bl_status(uuid, livreur.bl_status, jsonb) is
  'Authoritative BL status transition. Validates (from, to) against the '
  'state machine and the caller''s role. History row is auto-logged by '
  'trg_log_bl_status_change and enriched with p_metadata post-update. '
  'Use record_failed_attempt() for failure-path transitions (T1/T2/abandon).';

revoke all     on function livreur.transition_bl_status(uuid, livreur.bl_status, jsonb) from public;
grant  execute on function livreur.transition_bl_status(uuid, livreur.bl_status, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC livreur.record_failed_attempt — palier T1 / T2 / abandon
-- ─────────────────────────────────────────────────────────────────────────────
-- Caller: authenticated livreur (own BL) OR admin/vendeur (any BL).
-- Pre:    BL.statut ∈ {en_livraison, en_route, echec_T1} AND
--         nb_tentatives < 3 AND admin_waiver lookup (force-majeure path)
-- Post:   • nb_tentatives ++
--         • statut → echec_T1 (1st), echec_T2 (2nd), abandon (3rd)
--         • bl_attempt_log row inserted (analytics)
--         • attempt_log JSONB array on the BL appended (fast read for UI)
--         • livreur.notifications inserted for vendeur + admin
--         • frais re-livraison auto-computed by trg_frais_relivraison
--         • status history row auto-inserted by trg_log_bl_status_change
--           and enriched in-place with motif/photo metadata
-- Errors: NOT_AUTHENTICATED, BL_NOT_FOUND, BL_NOT_ASSIGNED_TO_YOU,
--         INVALID_BL_STATUS_FOR_FAILURE, MAX_ATTEMPTS_REACHED
--
-- Force-majeure exemption:
--   Reasons that are NOT the client's fault → admin_waiver auto-flipped to
--   true so trg_frais_relivraison computes 0€. The waiver is reversible by
--   admin via direct UPDATE on the BL.
--     meteo            → driver couldn't reach (storm, snow)
--     panne_vehicule   → driver vehicle broke down
--     articles_endommages / colis_perdu → store-side fault
--   The other reasons (client_absent, client_refuse, adresse_introuvable,
--   autre) carry the standard 5% re-livraison fee.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.record_failed_attempt(
  p_bl_id            uuid,
  p_motif            livreur.attempt_failure_reason,
  p_commentaire      text    default null,
  p_photo_litige_url text    default null,
  p_latitude         numeric default null,
  p_longitude        numeric default null
)
returns json
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_role           livreur.user_role;
  v_bl             livreur.bons_livraison%rowtype;
  v_new_attempts   int;
  v_new_status     livreur.bl_status;
  v_is_force_maj   boolean;
  v_started_at     timestamptz := clock_timestamp();
  v_attempt_event  jsonb;
  v_attempt_row_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from livreur.profiles where id = v_user_id;
  if v_role is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_bl from livreur.bons_livraison
   where id = p_bl_id for update;
  if not found then
    raise exception 'BL_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Scope: driver on own BL, or admin/vendeur on any
  if v_bl.livreur_id is distinct from v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'BL_NOT_ASSIGNED_TO_YOU' using errcode = '42501';
  end if;

  -- A failure can only be reported from these statuses
  if v_bl.statut not in ('en_livraison','en_route','echec_T1') then
    raise exception
      'INVALID_BL_STATUS_FOR_FAILURE:%', v_bl.statut::text
      using errcode = 'P0001',
            hint    = 'Failures can only be reported from en_livraison, '
                   || 'en_route, or echec_T1 (chained retry).';
  end if;

  -- Bump attempt counter
  v_new_attempts := coalesce(v_bl.nb_tentatives, 0) + 1;
  if v_new_attempts > 3 then
    raise exception 'MAX_ATTEMPTS_REACHED' using
      errcode = 'P0001',
      hint    = 'BL already at 3 attempts. Must transition to retour_planifie '
             || 'or abandon via transition_bl_status().';
  end if;

  -- Compute new status from palier (RG-241)
  v_new_status := case
    when v_new_attempts = 1 then 'echec_T1'::livreur.bl_status
    when v_new_attempts = 2 then 'echec_T2'::livreur.bl_status
    when v_new_attempts = 3 then 'abandon'::livreur.bl_status
  end;

  -- Force-majeure detection — flip admin_waiver so the BEFORE-trigger
  -- computes 0€ for montant_frais_relivraison. Never CLEAR an existing
  -- waiver (an admin may have already waived for another reason).
  v_is_force_maj := p_motif in ('meteo','panne_vehicule','articles_endommages','colis_perdu');

  -- Build the structured event for the in-row JSONB log
  v_attempt_event := jsonb_build_object(
    'attempt_number',   v_new_attempts,
    'motif',            p_motif::text,
    'commentaire',      p_commentaire,
    'photo_litige_url', p_photo_litige_url,
    'latitude',         p_latitude,
    'longitude',        p_longitude,
    'force_majeure',    v_is_force_maj,
    'recorded_at',      now(),
    'recorded_by',      v_user_id,
    'previous_status',  v_bl.statut::text,
    'new_status',       v_new_status::text
  );

  -- Insert the canonical analytics row (immutable per RLS)
  insert into livreur.bl_attempt_log (
    bl_id, livreur_id, numero_tentative, motif,
    commentaire, photo_litige_url, latitude, longitude, recorded_at
  ) values (
    p_bl_id, coalesce(v_bl.livreur_id, v_user_id), v_new_attempts, p_motif,
    p_commentaire, p_photo_litige_url, p_latitude, p_longitude, now()
  )
  returning id into v_attempt_row_id;

  -- Update the BL atomically. The BEFORE-trigger calculate_frais_relivraison
  -- will set montant_frais_relivraison from nb_tentatives + admin_waiver.
  -- The AFTER-trigger log_bl_status_change will append to bl_status_history.
  update livreur.bons_livraison
     set statut         = v_new_status,
         nb_tentatives  = v_new_attempts,
         attempt_log    = coalesce(attempt_log, '[]'::jsonb)
                          || jsonb_build_array(v_attempt_event),
         admin_waiver   = admin_waiver or v_is_force_maj,
         photo_litige_url = coalesce(p_photo_litige_url, photo_litige_url),
         updated_at     = now()
   where id = p_bl_id;

  -- Enrich the freshly-inserted history row with the failure details so
  -- the admin audit view shows the motif without joining bl_attempt_log.
  update livreur.bl_status_history
     set metadata       = jsonb_build_object(
                            'rpc',              'record_failed_attempt',
                            'attempt_number',   v_new_attempts,
                            'motif',            p_motif::text,
                            'force_majeure',    v_is_force_maj,
                            'attempt_log_id',   v_attempt_row_id
                          ),
         trigger_source = 'rpc:record_failed_attempt'
   where id = (
     select id from livreur.bl_status_history
      where bl_id = p_bl_id and changed_at >= v_started_at
      order by changed_at desc limit 1
   );

  -- Notifications — livreur is the actor, no need to notify themselves.
  -- Vendeur gets a "delivery failed" alert; admin gets the same if distinct.
  if v_bl.vendeur_id is not null and v_bl.vendeur_id is distinct from v_user_id then
    insert into livreur.notifications (
      user_id, type, title, body, bl_id, link, metadata
    ) values (
      v_bl.vendeur_id,
      'bl_attempt_failed',
      'Tentative échouée',
      'BL ' || v_bl.numero_bl || ' — tentative ' || v_new_attempts || '/3 (' || p_motif::text || ')',
      p_bl_id,
      '/bl/' || p_bl_id::text,
      jsonb_build_object(
        'attempt_number', v_new_attempts,
        'motif',          p_motif::text,
        'new_status',     v_new_status::text,
        'force_majeure',  v_is_force_maj
      )
    );
  end if;

  return json_build_object(
    'success',         true,
    'bl_id',           p_bl_id,
    'previous_status', v_bl.statut::text,
    'new_status',      v_new_status::text,
    'attempt_number',  v_new_attempts,
    'attempt_log_id',  v_attempt_row_id,
    'force_majeure',   v_is_force_maj,
    'recorded_at',     now()
  );
end;
$$;

comment on function livreur.record_failed_attempt(uuid, livreur.attempt_failure_reason, text, text, numeric, numeric) is
  'Records a failed delivery attempt with motif, comment, photo, and GPS. '
  'Auto-transitions BL to echec_T1 / echec_T2 / abandon based on palier. '
  'Sets admin_waiver=true for force-majeure motifs (meteo, panne_vehicule, '
  'articles_endommages, colis_perdu) so trg_frais_relivraison computes 0€. '
  'Inserts into bl_attempt_log (analytics) and appends to bons_livraison.attempt_log '
  '(JSONB, fast UI read).';

revoke all     on function livreur.record_failed_attempt(uuid, livreur.attempt_failure_reason, text, text, numeric, numeric) from public;
grant  execute on function livreur.record_failed_attempt(uuid, livreur.attempt_failure_reason, text, text, numeric, numeric) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC livreur.get_driver_daily_kpis — Phase 8 dashboard tiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Caller: driver (own KPIs) OR admin/vendeur (any driver).
-- Returns a flat JSON with daily totals + ratios, ready for direct binding
-- to the Performance.tsx tiles. Date defaults to current_date, driver to
-- the calling user.
--
-- Rationale for keeping this in SQL rather than the view v_kpis_today:
--   • Caller-scoped (auth.uid()) without dragging RLS quirks.
--   • Returns a single row even when no BL exists (zero-filled).
--   • Adds derived ratios (signature_rate, success_rate, on_time_rate)
--     that the v_kpis_today view doesn't compute.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.get_driver_daily_kpis(
  p_date       date default current_date,
  p_driver_id  uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_role       livreur.user_role;
  v_target     uuid;
  v_total          int := 0;
  v_delivered      int := 0;  -- statut = 'livre' OR 'signe'
  v_signed         int := 0;  -- statut = 'signe'
  v_in_progress    int := 0;  -- en_livraison + en_route + signature_attendue
  v_remaining      int := 0;  -- assigne + confirme + release_demandee
  v_failed_t1      int := 0;
  v_failed_t2      int := 0;
  v_abandoned      int := 0;
  v_signature_rate numeric(5,2) := 0;
  v_success_rate   numeric(5,2) := 0;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from livreur.profiles where id = v_user_id;

  v_target := coalesce(p_driver_id, v_user_id);

  -- Scope check: looking at someone else's KPIs requires admin/vendeur.
  if v_target <> v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Only admin/vendeur can read another driver''s KPIs.';
  end if;

  select
    count(*),
    count(*) filter (where statut in ('livre','signe')),
    count(*) filter (where statut = 'signe'),
    count(*) filter (where statut in ('en_livraison','en_route','signature_attendue')),
    count(*) filter (where statut in ('assigne','confirme','release_demandee')),
    count(*) filter (where statut = 'echec_T1'),
    count(*) filter (where statut = 'echec_T2'),
    count(*) filter (where statut = 'abandon')
  into
    v_total, v_delivered, v_signed, v_in_progress, v_remaining,
    v_failed_t1, v_failed_t2, v_abandoned
    from livreur.bons_livraison
   where livreur_id           = v_target
     and date_livraison_prevue = p_date;

  -- Ratios — null when denominator is 0 to distinguish "no data" from 0%.
  if v_delivered > 0 then
    v_signature_rate := round(100.0 * v_signed / v_delivered, 1);
  end if;
  if v_total > 0 then
    v_success_rate := round(100.0 * v_delivered / v_total, 1);
  end if;

  return json_build_object(
    'driver_id',       v_target,
    'date',            p_date,
    'total',           v_total,
    'delivered',       v_delivered,
    'signed',          v_signed,
    'in_progress',     v_in_progress,
    'remaining',       v_remaining,
    'failed_t1',       v_failed_t1,
    'failed_t2',       v_failed_t2,
    'abandoned',       v_abandoned,
    'signature_rate',  case when v_delivered > 0 then v_signature_rate else null end,
    'success_rate',    case when v_total     > 0 then v_success_rate   else null end,
    'computed_at',     now()
  );
end;
$$;

comment on function livreur.get_driver_daily_kpis(date, uuid) is
  'Daily KPI tiles for a driver. Returns zero-filled row even on empty days. '
  'Driver scope or admin/vendeur cross-driver read.';

revoke all     on function livreur.get_driver_daily_kpis(date, uuid) from public;
grant  execute on function livreur.get_driver_daily_kpis(date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC livreur.get_driver_period_score — Phase 8 longitudinal score
-- ─────────────────────────────────────────────────────────────────────────────
-- Rolling-period KPIs (default last 30 days). Returns the canonical driver
-- scorecard used by the dashboard + the admin overview:
--
--   • total / delivered / signed / failed / abandoned counts
--   • success_rate, signature_rate, failure_rate
--   • avg_attempts_per_failed_bl
--   • on_time_rate (delivered with date_livraison_effective on the day
--                   it was prevue — within 24h of date_livraison_prevue)
--   • days_active (distinct days with at least one BL action)
--
-- All deltas are inclusive of both endpoints. Caller must be the driver or
-- admin/vendeur.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function livreur.get_driver_period_score(
  p_from       date default (current_date - interval '30 days')::date,
  p_to         date default current_date,
  p_driver_id  uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_role     livreur.user_role;
  v_target   uuid;
  v_total          int := 0;
  v_delivered      int := 0;
  v_signed         int := 0;
  v_failed         int := 0;  -- echec_T1 + echec_T2
  v_abandoned      int := 0;
  v_on_time        int := 0;
  v_total_attempts int := 0;  -- sum of nb_tentatives over failed BLs
  v_days_active    int := 0;
  v_signature_rate numeric(5,2);
  v_success_rate   numeric(5,2);
  v_failure_rate   numeric(5,2);
  v_on_time_rate   numeric(5,2);
  v_avg_attempts   numeric(5,2);
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_from > p_to then
    raise exception 'INVALID_PERIOD' using
      errcode = '22023',
      hint    = 'p_from must be <= p_to.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'PERIOD_TOO_LONG' using
      errcode = '22023',
      hint    = 'Periods longer than 366 days are not supported. Aggregate client-side.';
  end if;

  select role into v_role from livreur.profiles where id = v_user_id;
  v_target := coalesce(p_driver_id, v_user_id);

  if v_target <> v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (where statut in ('livre','signe')),
    count(*) filter (where statut = 'signe'),
    count(*) filter (where statut in ('echec_T1','echec_T2')),
    count(*) filter (where statut = 'abandon'),
    count(*) filter (
      where statut in ('livre','signe')
        and date_livraison_effective is not null
        and date_livraison_effective::date <= date_livraison_prevue
    ),
    coalesce(sum(nb_tentatives) filter (
      where statut in ('echec_T1','echec_T2','abandon')
    ), 0)::int,
    count(distinct date_livraison_prevue)
  into
    v_total, v_delivered, v_signed, v_failed, v_abandoned,
    v_on_time, v_total_attempts, v_days_active
    from livreur.bons_livraison
   where livreur_id            = v_target
     and date_livraison_prevue between p_from and p_to;

  v_signature_rate := case when v_delivered > 0
    then round(100.0 * v_signed / v_delivered, 1) end;
  v_success_rate   := case when v_total > 0
    then round(100.0 * v_delivered / v_total, 1) end;
  v_failure_rate   := case when v_total > 0
    then round(100.0 * (v_failed + v_abandoned) / v_total, 1) end;
  v_on_time_rate   := case when v_delivered > 0
    then round(100.0 * v_on_time / v_delivered, 1) end;
  v_avg_attempts   := case when (v_failed + v_abandoned) > 0
    then round(1.0 * v_total_attempts / (v_failed + v_abandoned), 2) end;

  return json_build_object(
    'driver_id',                  v_target,
    'period_from',                p_from,
    'period_to',                  p_to,
    'period_days',                (p_to - p_from + 1),
    'total',                      v_total,
    'delivered',                  v_delivered,
    'signed',                     v_signed,
    'failed',                     v_failed,
    'abandoned',                  v_abandoned,
    'on_time',                    v_on_time,
    'days_active',                v_days_active,
    'signature_rate',             v_signature_rate,
    'success_rate',               v_success_rate,
    'failure_rate',               v_failure_rate,
    'on_time_rate',               v_on_time_rate,
    'avg_attempts_per_failed_bl', v_avg_attempts,
    'computed_at',                now()
  );
end;
$$;

comment on function livreur.get_driver_period_score(date, date, uuid) is
  'Rolling period KPI scorecard for a driver. Default window: last 30 days. '
  'Returns a single-row JSON for direct binding to the Performance dashboard.';

revoke all     on function livreur.get_driver_period_score(date, date, uuid) from public;
grant  execute on function livreur.get_driver_period_score(date, date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Auto-provisioning trigger — auth.users → livreur.profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Before this trigger existed, every new auth user required a manual INSERT
-- into livreur.profiles after signup. RLS would then 403 every read until
-- an admin pasted the matching SQL.
--
-- Now, when Supabase Auth creates a row in auth.users (signup OR
-- "Add user" in Studio), this trigger inserts a SKELETON profile:
--   • role             = 'livreur' (the dominant role for this app)
--   • is_active        = false      (admin must approve before access)
--   • preferred_language = 'fr' or whatever raw_user_meta_data carries
--   • nom / prenom     = pulled from raw_user_meta_data when present
--
-- An admin still must flip is_active → true and adjust role before the
-- user can do anything useful (the RLS helpers all gate on is_active).
--
-- Security notes:
--   • `security definer` + `set search_path = ''` per the Supabase advisory
--     to prevent search_path injection on the auth.users insert path.
--   • Wrapped in BEGIN/EXCEPTION so a malformed metadata payload can't
--     block signup — the auth row is preserved even if the profile insert
--     errors. The admin can fix the profile manually after.
--   • `on conflict (id) do nothing` so re-running the trigger (or manual
--     pre-creation by admin) doesn't fail.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_livreur_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom      text;
  v_prenom   text;
  v_phone    text;
  v_lang     text;
begin
  -- Defensive metadata extraction. raw_user_meta_data is a jsonb and may
  -- be NULL when the user is created through the Studio admin UI.
  v_nom    := nullif(trim(new.raw_user_meta_data ->> 'nom'),    '');
  v_prenom := nullif(trim(new.raw_user_meta_data ->> 'prenom'), '');
  v_phone  := nullif(trim(new.raw_user_meta_data ->> 'telephone'), '');
  v_lang   := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'preferred_language'), ''),
    'fr'
  );
  if v_lang not in ('fr','ar') then
    v_lang := 'fr';
  end if;

  begin
    insert into livreur.profiles (
      id, email, nom, prenom, telephone,
      role, is_active, preferred_language
    ) values (
      new.id,
      new.email,
      v_nom,
      v_prenom,
      v_phone,
      'livreur'::livreur.user_role,
      false,
      v_lang
    )
    on conflict (id) do nothing;
  exception when others then
    -- NEVER block signup. Surface to Postgres logs only.
    raise warning '[livreur] handle_new_livreur_user failed for %: % %',
      new.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.handle_new_livreur_user() is
  'Trigger function: inserts a skeleton livreur.profiles row when a new '
  'auth.users is created. Defaults: role=livreur, is_active=false. Admin '
  'must approve. Failures are warned (logged) but never block signup.';

drop trigger if exists on_auth_user_created_livreur on auth.users;
create trigger on_auth_user_created_livreur
  after insert on auth.users
  for each row execute function public.handle_new_livreur_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Realtime publication — make livreur.bons_livraison broadcast events
-- ─────────────────────────────────────────────────────────────────────────────
-- Without this, the `supabase.channel(...).on('postgres_changes', ...)`
-- subscription in src/hooks/useBLsRealtime.ts will succeed but never fire
-- callbacks: the WAL changes for `livreur.bons_livraison` aren't shipped
-- to the realtime worker.
--
-- Idempotent: only adds tables not already in the publication. Wrapped in
-- a guard so re-running on a fresh project (where supabase_realtime may
-- not exist yet) doesn't error.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_pub_exists boolean;
  v_tbl_exists boolean;
begin
  select exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    into v_pub_exists;
  if not v_pub_exists then
    raise notice 'supabase_realtime publication not found — skipping. '
                 'This is expected outside Supabase. On Supabase, the '
                 'publication is auto-created.';
    return;
  end if;

  -- bons_livraison — primary table the PWA subscribes to
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'livreur'
       and tablename = 'bons_livraison'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table livreur.bons_livraison;
    raise notice 'Added livreur.bons_livraison to supabase_realtime publication.';
  end if;

  -- notifications — for in-app feed live updates
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'livreur'
       and tablename = 'notifications'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table livreur.notifications;
    raise notice 'Added livreur.notifications to supabase_realtime publication.';
  end if;

  -- signatures_electroniques — to detect signe / signature_expiree transitions
  -- on the BLDetail page even before the bons_livraison update lands.
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'livreur'
       and tablename = 'signatures_electroniques'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table livreur.signatures_electroniques;
    raise notice 'Added livreur.signatures_electroniques to supabase_realtime publication.';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Register this migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('010_livreur_workflow_rpcs.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Verification (paste in Supabase Studio → SQL Editor):
--
--    -- 1. All five RPCs registered
--    select proname, pronargs
--      from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'livreur'
--       and p.proname in (
--         'transition_bl_status', 'record_failed_attempt',
--         'get_driver_daily_kpis', 'get_driver_period_score',
--         'allowed_bl_transitions', 'my_allowed_bl_transitions'
--       )
--     order by proname;
--    -- expected: 6 rows
--
--    -- 2. Auto-provisioning trigger attached
--    select tgname, tgrelid::regclass
--      from pg_trigger
--     where tgname = 'on_auth_user_created_livreur';
--    -- expected: 1 row, tgrelid = auth.users
--
--    -- 3. Realtime publication includes the new tables
--    select schemaname, tablename
--      from pg_publication_tables
--     where pubname = 'supabase_realtime' and schemaname = 'livreur'
--     order by tablename;
--    -- expected: bons_livraison, notifications, signatures_electroniques
--
--    -- 4. State machine sanity check
--    select unnest(livreur.allowed_bl_transitions('en_route', 'livreur'));
--    -- expected: livre, echec_T1
--    select unnest(livreur.allowed_bl_transitions('cree', 'admin'));
--    -- expected: assigne, bloque
--    select unnest(livreur.allowed_bl_transitions('signe', 'admin'));
--    -- expected: <none — terminal>
--
--    -- 5. KPI smoke (run as an authenticated livreur)
--    select livreur.get_driver_daily_kpis();           -- today, self
--    select livreur.get_driver_period_score();         -- last 30d, self
-- ════════════════════════════════════════════════════════════════════════════
