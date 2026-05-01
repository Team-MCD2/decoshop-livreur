-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Signature: make email optional (post-consolidation)
-- ════════════════════════════════════════════════════════════════════════════
--
--  CONTEXT (2026-04-30 consolidation):
--    The original 006_livreur_signature_rpcs.sql required the client to have
--    an email — both as a NOT NULL constraint on
--    `livreur.signatures_electroniques.email_client` AND as a defensive check
--    inside `livreur.request_signature(...)`.
--
--    That made sense when the Edge Function `send-signature-email` was always
--    deployed and Resend was always configured. Post-consolidation, the email
--    feature is OPT-IN behind `VITE_ENABLE_SIGNATURE_EMAIL`. The livreur can
--    just copy the `/sign/<token>` URL and share it via SMS / WhatsApp / QR.
--
--    Therefore: the signature row should generate even when the client has
--    no email on file. This migration:
--      1. Drops the NOT NULL constraint on `email_client`
--      2. Replaces `livreur.request_signature(...)` with a version that no
--         longer raises CLIENT_HAS_NO_EMAIL and inserts NULL email if absent.
--
--  Idempotent. Safe to re-run. Revert script: 008_livreur_signature_optional_email_revert.sql
--
--  Run AFTER: 006_livreur_signature_rpcs.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Make `email_client` nullable on signatures_electroniques
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER ... DROP NOT NULL is idempotent — succeeds whether the constraint
-- exists or has been dropped already.
alter table livreur.signatures_electroniques
  alter column email_client drop not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace request_signature: email no longer required
-- ─────────────────────────────────────────────────────────────────────────────
-- Identical to the v006 implementation EXCEPT:
--   • the CLIENT_HAS_NO_EMAIL pre-check is removed
--   • the email is recorded as NULL when blank/missing (instead of failing)
--   • the function returns `email_client: null` in that case so the UI can
--     adapt (show "share link manually" instead of "email sent").
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
  v_email       text;
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

  -- Email is OPTIONAL post-consolidation. Normalize empty strings to NULL.
  select * into v_client from livreur.clients where id = v_bl.client_id;
  v_email := nullif(trim(coalesce(v_client.email, '')), '');

  v_token      := encode(gen_random_bytes(32), 'hex');
  v_expiration := now() + (p_ttl_minutes || ' minutes')::interval;

  -- Upsert: replace any existing signature row for this BL.
  insert into livreur.signatures_electroniques (
    bl_id, token, email_client, statut,
    date_emission, date_expiration, retry_count
  ) values (
    p_bl_id, v_token, v_email, 'en_attente',
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
    'email_client',    v_email
  );
end;
$$;

-- Re-grant (idempotent — REVOKE then GRANT)
revoke all     on function livreur.request_signature(uuid, int) from public;
grant  execute on function livreur.request_signature(uuid, int) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Register migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('008_livreur_signature_optional_email.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Smoke test (run manually after migration as authenticated livreur):
--
--    -- 1) Pick a BL in 'livre' status whose client has NO email
--    select b.id, b.statut, c.email
--      from livreur.bons_livraison b
--      join livreur.clients c on c.id = b.client_id
--     where b.statut = 'livre'
--       and (c.email is null or trim(c.email) = '')
--     limit 1;
--
--    -- 2) Call request_signature on it — should succeed and return
--    --    { ..., email_client: null }
--    select livreur.request_signature('<bl-id-from-step-1>'::uuid, 10);
-- ════════════════════════════════════════════════════════════════════════════
