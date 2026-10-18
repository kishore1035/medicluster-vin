-- MediCluster alone owns this private bucket. Existing dispatch buckets and
-- policies remain intact. Binary objects are managed through the Storage API.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('medicluster-media', 'medicluster-media', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 52428800;

-- Restrictive policies also deny access when another app has installed broad
-- permissive Storage policies. The backend service_role bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'medicluster_media_backend_only'
  ) THEN
    CREATE POLICY medicluster_media_backend_only ON storage.objects
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (bucket_id <> 'medicluster-media')
      WITH CHECK (bucket_id <> 'medicluster-media');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'buckets' AND policyname = 'medicluster_media_bucket_backend_only'
  ) THEN
    CREATE POLICY medicluster_media_bucket_backend_only ON storage.buckets
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (id <> 'medicluster-media')
      WITH CHECK (id <> 'medicluster-media');
  END IF;
END;
$$;

COMMIT;
