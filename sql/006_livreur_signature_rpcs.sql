-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Signature RPCs  (10-min token flow + admin invalidation)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Five RPCs that implement the 10-minute electronic-signature workflow:
--
--    1. livreur.request_signature(p_bl_id, p_ttl_minutes)
--         driver/admin/vendeur → emit a fresh 64-hex token, BL → signature_attendue
--    2. livreur.submit_signature(p_token, p_signature_data, ...)
--         anonymous client → record signature, BL → signe
--    3. livreur.get_signature_public(p_token)
--         anonymous client → minimal payload for the /sign/:token page
--    4. livreur.expire_pending_signatures()
--         pg_cron sweep → mark expired tokens, BL → signature_expiree
--    5. livreur.invalidate_signature(p_bl_id, p_motif)
--         admin/vendeur → cancel a pending signature, BL → livre
--
--  Design decision (see 05_signature_rpcs.sql legacy comment):
--    Token = 32-byte random hex (gen_random_bytes(32)) with DB lookup, NOT a
--    JWT. Trade-off: 1 round-trip per resolve (negligible) vs ability to
--    revoke instantly + audit-trail in SQL natively + no secret to rotate.
--
--  All RPCs are SECURITY DEFINER + locked search_path to bypass RLS where
--  intended (e.g. anon submitting a signature) without exposing the rest
--  of the schema.
--
--  Run AFTER: 003_livreur_schema.sql, 004_livreur_triggers_views.sql,
--             005_livreur_rls.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. request_signature(p_bl_id, p_ttl_minutes)
-- ─────────────────────────────────────────────────────────────────────────────
-- Caller: authenticated livreur (own BL) OR admin / vendeur (any BL).
-- Pre:    BL.statut ∈ {livre, signature_attendue, signature_expiree}
-- Post:   signature row UPSERTed; BL.statut = signature_attendue
-- Errors: NOT_AUTHENTICATED, BL_NOT_FOUND, BL_NOT_ASSIGNED_TO_YOU,
--         INVALID_BL_STATUS:<status>, CLIENT_HAS_NO_EMAIL
create or replace function livreur.request_signature(
  p_bl_id        uuid,
  p_ttl_minutes  int default 10
)
returns json
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_role        livreur.user_role;
  v_bl          livreur.bons_livraison%rowtype;
  v_client      livreur.clients%rowtype;
  v_token       text;
  v_expiration  timestamptz;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from livreur.profiles where id = v_user_id;

  select * into v_bl from livreur.bons_livraison where id = p_bl_id;
  if not found then
    raise exception 'BL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_bl.livreur_id is distinct from v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'BL_NOT_ASSIGNED_TO_YOU' using errcode = '42501';
  end if;

  if v_bl.statut not in ('livre','signature_attendue','signature_expiree') then
    raise exception 'INVALID_BL_STATUS:%', v_bl.statut using errcode = 'P0001';
  end if;

  -- Clamp TTL to 1..60 min (defense in depth; client also enforces)
  if p_ttl_minutes < 1 or p_ttl_minutes > 60 then
    p_ttl_minutes := 10;
  end if;

  select * into v_client from livreur.clients where id = v_bl.client_id;
  if v_client.email is null or length(trim(v_client.email)) = 0 then
    raise exception 'CLIENT_HAS_NO_EMAIL' using
      errcode = '22023',
      hint    = 'Le client doit avoir une adresse email pour recevoir le lien de signature.';
  end if;

  v_token      := encode(gen_random_bytes(32), 'hex');
  v_expiration := now() + (p_ttl_minutes || ' minutes')::interval;

  -- Upsert: replace any existing signature row for this BL.
  insert into livreur.signatures_electroniques (
    bl_id, token, email_client, statut,
    date_emission, date_expiration, retry_count
  ) values (
    p_bl_id, v_token, v_client.email, 'en_attente',
    now(), v_expiration, 0
  )
  on conflict (bl_id) do update set
    token              = excluded.token,
    email_client       = excluded.email_client,
    statut             = 'en_attente',
    signature_data     = null,
    signature_png_url  = null,
    signe_par_parent   = false,
    parent_nom         = null,
    parent_lien        = null,
    client_ip          = null,
    user_agent         = null,
    date_emission      = now(),
    date_expiration    = v_expiration,
    date_signature     = null,
    retry_count        = livreur.signatures_electroniques.retry_count + 1;

  update livreur.bons_livraison
     set statut     = 'signature_attendue',
         updated_at = now()
   where id = p_bl_id;

  return json_build_object(
    'token',           v_token,
    'bl_id',           p_bl_id,
    'url_path',        '/sign/' || v_token,
    'date_emission',   now(),
    'date_expiration', v_expiration,
    'ttl_minutes',     p_ttl_minutes,
    'email_client',    v_client.email
  );
end;
$$;

revoke all     on function livreur.request_signature(uuid, int) from public;
grant  execute on function livreur.request_signature(uuid, int) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. submit_signature(p_token, p_signature_data, ...)
-- ─────────────────────────────────────────────────────────────────────────────
-- Caller: anonymous (the public /sign/:token page) OR authenticated.
-- Pre:    token exists, statut = 'en_attente', date_expiration > now
-- Post:   signature row → 'signe'; BL → 'signe' + date_livraison_effective set;
--         notifications inserted for livreur + vendeur
-- Errors: INVALID_TOKEN, INVALID_SIGNATURE_DATA, PARENT_NAME_REQUIRED,
--         SIGNATURE_TOKEN_NOT_FOUND, ALREADY_SIGNED, SIGNATURE_EXPIRED
create or replace function livreur.submit_signature(
  p_token             text,
  p_signature_data    text,
  p_signe_par_parent  boolean default false,
  p_parent_nom        text    default null,
  p_parent_lien       text    default null,
  p_user_agent        text    default null
)
returns json
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_sig         livreur.signatures_electroniques%rowtype;
  v_bl_numero   text;
  v_livreur_id  uuid;
  v_vendeur_id  uuid;
begin
  -- Token MUST be exactly 64 hex chars (32 bytes). Anything else → reject.
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN' using errcode = '22023';
  end if;
  -- Signature data: data:image/png;base64,... (>500 chars typical) or
  -- SVG path (>100 chars). 100 chars is the floor for "non-empty drawing".
  if p_signature_data is null or length(p_signature_data) < 100 then
    raise exception 'INVALID_SIGNATURE_DATA' using errcode = '22023';
  end if;
  if p_signe_par_parent and (p_parent_nom is null or length(trim(p_parent_nom)) < 2) then
    raise exception 'PARENT_NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Lock the row to prevent double-signature on concurrent submits.
  select * into v_sig
    from livreur.signatures_electroniques
   where token = p_token
   for update;

  if not found then
    raise exception 'SIGNATURE_TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_sig.statut = 'signe' then
    raise exception 'ALREADY_SIGNED' using errcode = 'P0001';
  end if;
  if v_sig.statut = 'expire' or v_sig.date_expiration < now() then
    -- Pessimistic: ensure status is 'expire' even if pre-cron caught us first.
    update livreur.signatures_electroniques set statut = 'expire' where id = v_sig.id;
    update livreur.bons_livraison
       set statut = 'signature_expiree'
     where id = v_sig.bl_id and statut = 'signature_attendue';
    raise exception 'SIGNATURE_EXPIRED' using errcode = 'P0001';
  end if;

  -- Record the signature.
  update livreur.signatures_electroniques
     set statut            = 'signe',
         signature_data    = p_signature_data,
         signe_par_parent  = coalesce(p_signe_par_parent, false),
         parent_nom        = p_parent_nom,
         parent_lien       = p_parent_lien,
         user_agent        = p_user_agent,
         date_signature    = now()
   where id = v_sig.id;

  -- Transition BL → 'signe' + stamp date_livraison_effective if not set.
  update livreur.bons_livraison
     set statut                    = 'signe',
         date_signature            = now(),
         date_livraison_effective  = coalesce(date_livraison_effective, now()),
         updated_at                = now()
   where id = v_sig.bl_id
   returning numero_bl, livreur_id, vendeur_id
        into v_bl_numero, v_livreur_id, v_vendeur_id;

  -- Notify the livreur (RG-263).
  if v_livreur_id is not null then
    insert into livreur.notifications (user_id, type, title, body, bl_id, link, metadata)
    values (
      v_livreur_id, 'bl_signed',
      'Signature OK',
      'Le client a signé le BL ' || v_bl_numero,
      v_sig.bl_id, '/bl/' || v_sig.bl_id::text,
      jsonb_build_object('signature_id', v_sig.id, 'signed_at', now())
    );
  end if;
  -- Notify vendeur (if different from livreur).
  if v_vendeur_id is not null and v_vendeur_id is distinct from v_livreur_id then
    insert into livreur.notifications (user_id, type, title, body, bl_id, link, metadata)
    values (
      v_vendeur_id, 'bl_signed',
      'Livraison signée',
      'BL ' || v_bl_numero || ' signé par le client',
      v_sig.bl_id, '/bl/' || v_sig.bl_id::text,
      jsonb_build_object('signature_id', v_sig.id, 'signed_at', now())
    );
  end if;

  return json_build_object(
    'success',   true,
    'bl_id',     v_sig.bl_id,
    'numero_bl', v_bl_numero,
    'signed_at', now()
  );
end;
$$;

-- Anon CAN submit a signature (this is the whole point of the public page).
revoke all     on function livreur.submit_signature(text, text, boolean, text, text, text) from public;
grant  execute on function livreur.submit_signature(text, text, boolean, text, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_signature_public(p_token) — minimal-leak read for /sign/:token
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns ONLY the fields the client needs to render their signature page.
-- Never exposes: livreur_id, vendeur_id, code_porte, commentaire_acces,
-- shopify ids, addresses (only ville). Article details are reduced to a
-- count to limit data leakage if the token is brute-forced (it isn't, but
-- defense in depth).
create or replace function livreur.get_signature_public(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_sig     livreur.signatures_electroniques%rowtype;
  v_bl      livreur.bons_livraison%rowtype;
  v_client  livreur.clients%rowtype;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN' using errcode = '22023';
  end if;

  select * into v_sig from livreur.signatures_electroniques where token = p_token;
  if not found then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_bl     from livreur.bons_livraison where id = v_sig.bl_id;
  select * into v_client from livreur.clients        where id = v_bl.client_id;

  return json_build_object(
    'status',                v_sig.statut::text,
    'is_expired',            v_sig.date_expiration < now(),
    'is_signed',             v_sig.statut = 'signe',
    'date_emission',         v_sig.date_emission,
    'date_expiration',       v_sig.date_expiration,
    'date_signature',        v_sig.date_signature,
    'numero_bl',             v_bl.numero_bl,
    'montant_total_ttc',     v_bl.montant_total_ttc,
    'mode_livraison',        v_bl.mode_livraison::text,
    'creneau',               v_bl.creneau::text,
    'date_livraison_prevue', v_bl.date_livraison_prevue,
    'client_nom',            v_client.nom,
    'client_prenom',         v_client.prenom,
    'client_ville',          v_client.ville,
    'articles_count',        (select count(*)::int from livreur.lignes_bl where bl_id = v_bl.id)
  );
end;
$$;

revoke all     on function livreur.get_signature_public(text) from public;
grant  execute on function livreur.get_signature_public(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. expire_pending_signatures() — cron sweep (RG-234)
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent. Schedule via pg_cron every minute (see README).
-- Returns: number of signatures expired in this run.
create or replace function livreur.expire_pending_signatures()
returns int
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_count int := 0;
  rec     record;
begin
  for rec in
    update livreur.signatures_electroniques
       set statut = 'expire'
     where statut = 'en_attente'
       and date_expiration < now()
    returning id, bl_id
  loop
    -- Transition BL only if still waiting (idempotent — don't clobber 'signe')
    update livreur.bons_livraison
       set statut     = 'signature_expiree',
           updated_at = now()
     where id = rec.bl_id
       and statut = 'signature_attendue';

    -- Notify livreur
    insert into livreur.notifications (user_id, type, title, body, bl_id, link, metadata)
    select bl.livreur_id, 'bl_signature_expired',
           'Signature expirée',
           'Le client n''a pas signé dans les 10 min — BL ' || bl.numero_bl,
           bl.id, '/bl/' || bl.id::text,
           jsonb_build_object('signature_id', rec.id, 'expired_at', now())
      from livreur.bons_livraison bl
     where bl.id = rec.bl_id and bl.livreur_id is not null;

    -- Notify vendeur (if different)
    insert into livreur.notifications (user_id, type, title, body, bl_id, link, metadata)
    select bl.vendeur_id, 'bl_signature_expired',
           'Signature non reçue',
           'BL ' || bl.numero_bl || ' — réémission possible côté admin',
           bl.id, '/bl/' || bl.id::text,
           jsonb_build_object('signature_id', rec.id, 'expired_at', now())
      from livreur.bons_livraison bl
     where bl.id = rec.bl_id
       and bl.vendeur_id is not null
       and bl.vendeur_id is distinct from bl.livreur_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function livreur.expire_pending_signatures() is
  'pg_cron sweep: mark `en_attente` signatures past expiration as `expire`, '
  'transition the BL to `signature_expiree`, notify livreur + vendeur. '
  'Schedule every minute. Idempotent.';

-- Intentionally NOT granted to anon/authenticated. Called by pg_cron (postgres
-- role) or via service_role from a monitoring Edge Function.


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. invalidate_signature(p_bl_id, p_motif) — admin cancellation (RG-236)
-- ─────────────────────────────────────────────────────────────────────────────
-- Use case: admin sends to wrong email, client wants to re-sign later, etc.
-- Refuses to invalidate an already-signed signature (immutability rule).
create or replace function livreur.invalidate_signature(
  p_bl_id  uuid,
  p_motif  text default null
)
returns json
language plpgsql
security definer
set search_path = livreur, public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_sig      livreur.signatures_electroniques%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not livreur.is_admin_or_vendeur() then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Seuls admin/vendeur peuvent invalider une signature.';
  end if;

  select * into v_sig from livreur.signatures_electroniques
   where bl_id = p_bl_id for update;
  if not found then
    raise exception 'SIGNATURE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_sig.statut = 'signe' then
    raise exception 'ALREADY_SIGNED_CANNOT_INVALIDATE' using
      errcode = 'P0001',
      hint    = 'Un BL signé est immuable (RG-236). Contacter l''admin pour audit log.';
  end if;

  -- We map "invalidated" → 'expire' since the ENUM has no dedicated value.
  -- The motif is preserved in the notification metadata for audit.
  update livreur.signatures_electroniques
     set statut          = 'expire',
         date_expiration = now()
   where id = v_sig.id;

  -- Reset BL to 'livre' so a fresh request_signature() can be issued.
  update livreur.bons_livraison
     set statut     = 'livre',
         updated_at = now()
   where id = p_bl_id
     and statut in ('signature_attendue','signature_expiree');

  -- Inform the livreur.
  insert into livreur.notifications (user_id, type, title, body, bl_id, link, metadata)
  select bl.livreur_id, 'bl_signature_expired',
         'Signature annulée',
         'L''admin a annulé la signature en cours' ||
           case when p_motif is not null then ' (motif : ' || p_motif || ')' else '' end,
         bl.id, '/bl/' || bl.id::text,
         jsonb_build_object(
           'signature_id',   v_sig.id,
           'invalidated_by', v_user_id,
           'motif',          p_motif
         )
    from livreur.bons_livraison bl
   where bl.id = p_bl_id and bl.livreur_id is not null;

  return json_build_object(
    'success',         true,
    'bl_id',           p_bl_id,
    'motif',           p_motif,
    'invalidated_at',  now(),
    'invalidated_by',  v_user_id
  );
end;
$$;

revoke all     on function livreur.invalidate_signature(uuid, text) from public;
grant  execute on function livreur.invalidate_signature(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Register this migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('006_livreur_signature_rpcs.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Schedule pg_cron (run ONCE after this migration, as postgres role):
--
--    create extension if not exists pg_cron;
--
--    select cron.schedule(
--      'livreur-expire-pending-signatures',
--      '* * * * *',
--      $$ select livreur.expire_pending_signatures(); $$
--    );
--
--    -- To unschedule:
--    -- select cron.unschedule('livreur-expire-pending-signatures');
--
--    -- To inspect runs:
--    -- select * from cron.job_run_details
--    --  where jobid = (select jobid from cron.job
--    --                  where jobname = 'livreur-expire-pending-signatures')
--    --  order by start_time desc limit 20;
-- ════════════════════════════════════════════════════════════════════════════
