-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Revert 008_livreur_signature_optional_email.sql
-- ════════════════════════════════════════════════════════════════════════════
--
--  Re-imposes the strict "client must have email" rule:
--    1. Restores NOT NULL on signatures_electroniques.email_client
--       (will FAIL if any existing rows have NULL — clean those first)
--    2. Restores the original request_signature with CLIENT_HAS_NO_EMAIL check
--
--  Run as postgres role.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Pre-check: any rows would block NOT NULL re-add?
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from livreur.signatures_electroniques
   where email_client is null;
  if v_count > 0 then
    raise notice
      'WARNING: % signatures rows have NULL email_client. NOT NULL re-add will FAIL. '
      'Either populate them (e.g. set to a placeholder) or accept that this revert '
      'leaves email_client nullable.', v_count;
  end if;
end$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Restore NOT NULL (will fail noisily if NULL rows exist — see step 0)
-- ─────────────────────────────────────────────────────────────────────────────
alter table livreur.signatures_electroniques
  alter column email_client set not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Restore the v006 request_signature with email pre-check
-- ─────────────────────────────────────────────────────────────────────────────
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
-- 3. Unregister migration
-- ─────────────────────────────────────────────────────────────────────────────
delete from public._migrations
 where filename = '008_livreur_signature_optional_email.sql';
