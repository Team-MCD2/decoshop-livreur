-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur Storage Buckets  (idempotent, additive)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Creates four storage buckets with role-based RLS:
--
--    ▸ delivery-photos         (private)  livreur photo de départ + litige
--    ▸ delivery-pdfs           (private)  generated BL PDFs
--    ▸ signatures              (private)  signature PNGs (post-render of base64)
--    ▸ article-photos          (public)   read-only catalog photos (inventory)
--
--  All buckets are private except `article-photos`. RLS on storage.objects
--  enforces who can read/write what.
--
--  Naming convention:
--    delivery-photos/<bl_id>/depart-<timestamp>.jpg
--    delivery-photos/<bl_id>/litige-<timestamp>.jpg
--    delivery-pdfs/<bl_id>/<numero_bl>.pdf
--    signatures/<bl_id>/<signature_id>.png
--    article-photos/<article_id>/<filename>
--
--  Run AFTER: 003_livreur_schema.sql (uses livreur.is_admin_or_vendeur etc.)
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create buckets (idempotent — uses upsert on storage.buckets)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('delivery-photos', 'delivery-photos', false, 10 * 1024 * 1024,
    array['image/jpeg','image/png','image/webp']),
  ('delivery-pdfs',   'delivery-pdfs',   false, 5  * 1024 * 1024,
    array['application/pdf']),
  ('signatures',      'signatures',      false, 1  * 1024 * 1024,
    array['image/png','image/svg+xml']),
  ('article-photos',  'article-photos',  true,  5  * 1024 * 1024,
    array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS on storage.objects — already enabled by Supabase. We just add policies.
-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: extract the BL id from the object path. Path format = "<bl_id>/...".
-- Returns NULL if the first path segment isn't a valid uuid.
create or replace function livreur.storage_bl_id_from_path(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

grant execute on function livreur.storage_bl_id_from_path(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. delivery-photos — livreur reads/writes photos for their own BL
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists delivery_photos_select on storage.objects;
create policy delivery_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-photos'
    and (
      livreur.is_admin_or_vendeur()
      or exists (
        select 1 from livreur.bons_livraison bl
         where bl.id = livreur.storage_bl_id_from_path(name)
           and bl.livreur_id = auth.uid()
      )
    )
  );

drop policy if exists delivery_photos_insert on storage.objects;
create policy delivery_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'delivery-photos'
    and (
      livreur.is_admin_or_vendeur()
      or exists (
        select 1 from livreur.bons_livraison bl
         where bl.id = livreur.storage_bl_id_from_path(name)
           and bl.livreur_id = auth.uid()
      )
    )
  );

drop policy if exists delivery_photos_update on storage.objects;
create policy delivery_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'delivery-photos'
    and (livreur.is_admin_or_vendeur() or owner = auth.uid())
  );

drop policy if exists delivery_photos_delete on storage.objects;
create policy delivery_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'delivery-photos'
    and livreur.is_admin()
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. delivery-pdfs — generated server-side; livreur + vendeur read; admin write
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists delivery_pdfs_select on storage.objects;
create policy delivery_pdfs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-pdfs'
    and (
      livreur.is_admin_or_vendeur()
      or exists (
        select 1 from livreur.bons_livraison bl
         where bl.id = livreur.storage_bl_id_from_path(name)
           and (bl.livreur_id = auth.uid() or bl.vendeur_id = auth.uid())
      )
    )
  );

-- Writes only via service_role (Edge Function generating the PDF). No
-- authenticated-role INSERT policy → blocks direct uploads from clients.
drop policy if exists delivery_pdfs_modify_admin on storage.objects;
create policy delivery_pdfs_modify_admin on storage.objects
  for all to authenticated
  using       (bucket_id = 'delivery-pdfs' and livreur.is_admin())
  with check  (bucket_id = 'delivery-pdfs' and livreur.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. signatures — written by Edge Function (service_role); read by admin/vendeur
-- ─────────────────────────────────────────────────────────────────────────────
-- The /sign/:token page never reads from storage directly — it submits the
-- base64 dataURL to livreur.submit_signature() (006), which returns the
-- BL number on success. Server-side rendering to PNG happens in an Edge
-- Function with service_role; that's outside RLS.
drop policy if exists signatures_select on storage.objects;
create policy signatures_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'signatures'
    and (
      livreur.is_admin_or_vendeur()
      or exists (
        select 1 from livreur.bons_livraison bl
         where bl.id = livreur.storage_bl_id_from_path(name)
           and bl.livreur_id = auth.uid()
      )
    )
  );

drop policy if exists signatures_modify_admin on storage.objects;
create policy signatures_modify_admin on storage.objects
  for all to authenticated
  using       (bucket_id = 'signatures' and livreur.is_admin())
  with check  (bucket_id = 'signatures' and livreur.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. article-photos — public read; admin/vendeur write
-- ─────────────────────────────────────────────────────────────────────────────
-- This bucket is also used by the inventory app (Astro). We do NOT alter
-- existing policies on it if they're already there — the upsert above won't
-- overwrite policies, and we use IF NOT EXISTS-equivalent guards here.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'article_photos_public_read'
  ) then
    create policy article_photos_public_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'article-photos');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'article_photos_modify_admin'
  ) then
    create policy article_photos_modify_admin on storage.objects
      for all to authenticated
      using       (bucket_id = 'article-photos' and livreur.is_admin_or_vendeur())
      with check  (bucket_id = 'article-photos' and livreur.is_admin_or_vendeur());
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Register this migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('007_livreur_storage.sql', 'livreur', null)
on conflict (filename) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
--  Verification:
--
--    -- 1) Buckets exist
--    select id, public, file_size_limit, allowed_mime_types
--      from storage.buckets
--     where id in ('delivery-photos','delivery-pdfs','signatures','article-photos')
--     order by id;
--
--    -- 2) Policies on storage.objects
--    select policyname, cmd, roles
--      from pg_policies
--     where schemaname = 'storage' and tablename = 'objects'
--       and policyname like 'delivery_%' or policyname like 'signatures_%'
--          or policyname like 'article_photos_%'
--     order by policyname;
-- ════════════════════════════════════════════════════════════════════════════
