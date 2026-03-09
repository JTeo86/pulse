
CREATE TABLE public.content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_by uuid NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('image', 'video')),
  source_type text NOT NULL CHECK (source_type IN ('upload', 'generated_image', 'generated_video', 'approved_output', 'variation', 'reel_source')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived', 'scheduled', 'published', 'failed')),
  title text NULL,
  prompt_snapshot jsonb NULL,
  generation_settings jsonb NULL,
  storage_path text NULL,
  public_url text NULL,
  thumbnail_url text NULL,
  mime_type text NULL,
  width integer NULL,
  height integer NULL,
  duration_seconds numeric NULL,
  parent_asset_id uuid NULL REFERENCES public.content_assets(id) ON DELETE SET NULL,
  root_asset_id uuid NULL REFERENCES public.content_assets(id) ON DELETE SET NULL,
  source_job_id uuid NULL,
  derived_from_editor_job_id uuid NULL,
  lineage_depth integer NOT NULL DEFAULT 0,
  is_favorite boolean NOT NULL DEFAULT false,
  is_style_reference boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_assets_venue_created ON public.content_assets (venue_id, created_at DESC);
CREATE INDEX idx_content_assets_venue_type ON public.content_assets (venue_id, asset_type);
CREATE INDEX idx_content_assets_venue_status ON public.content_assets (venue_id, status);
CREATE INDEX idx_content_assets_parent ON public.content_assets (parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX idx_content_assets_root ON public.content_assets (root_asset_id) WHERE root_asset_id IS NOT NULL;

CREATE TRIGGER content_assets_updated_at
  BEFORE UPDATE ON public.content_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view content assets"
  ON public.content_assets FOR SELECT
  TO authenticated
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Members can insert content assets"
  ON public.content_assets FOR INSERT
  TO authenticated
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Members can update content assets"
  ON public.content_assets FOR UPDATE
  TO authenticated
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can delete content assets"
  ON public.content_assets FOR DELETE
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()));

INSERT INTO public.content_assets (
  venue_id, created_by, asset_type, source_type, status,
  title, generation_settings, storage_path, public_url,
  mime_type, source_job_id, metadata, created_at
)
SELECT
  ea.venue_id,
  ea.created_by,
  'image',
  'generated_image',
  'draft',
  'Pro Photo',
  ea.settings_json,
  NULL,
  ea.output_urls[1],
  ea.output_types[1],
  ea.id,
  jsonb_build_object('backfilled_from', 'edited_assets', 'edited_asset_id', ea.id),
  ea.created_at
FROM public.edited_assets ea
WHERE NOT EXISTS (
  SELECT 1 FROM public.content_assets ca
  WHERE ca.metadata->>'edited_asset_id' = ea.id::text
);

NOTIFY pgrst, 'reload schema';
