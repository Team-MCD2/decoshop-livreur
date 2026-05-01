-- ════════════════════════════════════════════════════════════════════════════
--  REVERT — undo 007_livreur_storage.sql
-- ════════════════════════════════════════════════════════════════════════════
--  Drops the bucket policies and the buckets themselves.
--
--  ⚠ DESTRUCTIVE — drops file objects in those buckets. Backup first if
--    you care:
--      supabase storage download --bucket delivery-photos ...
--
--  Idempotent: drop if exists everywhere.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Drop bucket-scoped policies on storage.objects
drop policy if exists delivery_photos_select          on storage.objects;
drop policy if exists delivery_photos_insert          on storage.objects;
drop policy if exists delivery_photos_update          on storage.objects;
drop policy if exists delivery_photos_delete          on storage.objects;

drop policy if exists delivery_pdfs_select            on storage.objects;
drop policy if exists delivery_pdfs_modify_admin      on storage.objects;

drop policy if exists signatures_select               on storage.objects;
drop policy if exists signatures_modify_admin         on storage.objects;

drop policy if exists article_photos_public_read     on storage.objects;
drop policy if exists article_photos_modify_admin    on storage.objects;

-- 2. Empty the buckets first (storage.buckets has FK from storage.objects)
delete from storage.objects
 where bucket_id in ('delivery-photos','delivery-pdfs','signatures','article-photos');

-- 3. Drop the buckets
delete from storage.buckets
 where id in ('delivery-photos','delivery-pdfs','signatures','article-photos');

-- 4. Drop the storage helper (if 003 schema was kept)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'livreur') then
    drop function if exists livreur.storage_bl_id_from_path(text);
  end if;
end $$;

-- 5. Unregister the migration
delete from public._migrations where filename = '007_livreur_storage.sql';
