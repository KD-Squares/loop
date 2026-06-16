-- =============================================================================
-- Loop — 0003_storage.sql
-- Private Storage bucket `pdfs` for uploaded source PDFs.
--
-- Layout convention: files are stored under  <host_id>/<quiz_id>/<filename>.pdf
-- so the first path segment is always the owning host's UID. RLS policies below
-- enforce that a host can only touch objects under their own UID prefix.
-- =============================================================================

-- Create the private bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- A host can read their own PDFs (first folder segment == their uid).
drop policy if exists pdfs_select_own on storage.objects;
create policy pdfs_select_own on storage.objects
  for select
  using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A host can upload PDFs under their own prefix.
drop policy if exists pdfs_insert_own on storage.objects;
create policy pdfs_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A host can delete their own PDFs.
drop policy if exists pdfs_delete_own on storage.objects;
create policy pdfs_delete_own on storage.objects
  for delete
  using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
