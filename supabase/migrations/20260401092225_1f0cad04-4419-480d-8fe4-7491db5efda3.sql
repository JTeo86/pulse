
-- =====================================================
-- PART 1: Create new storage buckets
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-pool', 'asset-pool', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-library', 'content-library', false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- PART 2: Storage RLS policies for asset-pool
-- =====================================================
CREATE POLICY "Venue members can read asset-pool"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'asset-pool'
  AND public.is_venue_member(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

CREATE POLICY "Venue members can upload to asset-pool"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'asset-pool'
  AND public.is_venue_member(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

CREATE POLICY "Venue members can delete from asset-pool"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'asset-pool'
  AND public.is_venue_member(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

-- =====================================================
-- PART 3: Storage RLS policies for content-library
-- =====================================================
CREATE POLICY "Venue members can read content-library"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'content-library'
  AND public.is_venue_member(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

CREATE POLICY "Venue members can upload to content-library"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'content-library'
  AND public.is_venue_member(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

CREATE POLICY "Venue members can delete from content-library"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'content-library'
  AND public.is_venue_member(
    (storage.foldername(name))[1]::uuid,
    auth.uid()
  )
);

-- =====================================================
-- PART 4: Add pool + storage_bucket columns to content_assets
-- =====================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'content_assets' AND column_name = 'pool') THEN
    ALTER TABLE public.content_assets ADD COLUMN pool text NOT NULL DEFAULT 'asset_pool';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'content_assets' AND column_name = 'storage_bucket') THEN
    ALTER TABLE public.content_assets ADD COLUMN storage_bucket text NOT NULL DEFAULT 'venue-assets';
  END IF;
END $$;

-- Pool check constraint
ALTER TABLE public.content_assets
  DROP CONSTRAINT IF EXISTS content_assets_pool_check;
ALTER TABLE public.content_assets
  ADD CONSTRAINT content_assets_pool_check CHECK (pool IN ('asset_pool', 'content_library'));

-- =====================================================
-- PART 5: Backfill existing rows
-- =====================================================
-- Source uploads → asset_pool
UPDATE public.content_assets
SET pool = 'asset_pool'
WHERE source_type IN ('upload', 'reel_source');

-- Generated/output content → content_library
UPDATE public.content_assets
SET pool = 'content_library'
WHERE source_type IN ('generated_image', 'generated_video', 'approved_output', 'variation');
