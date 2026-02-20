
-- ============================================================
-- Style Intelligence Engine V2
-- ============================================================

-- 1. Enums
CREATE TYPE public.style_channel AS ENUM ('brand', 'atmosphere', 'plating');
CREATE TYPE public.style_asset_type AS ENUM ('image', 'video');
CREATE TYPE public.style_asset_status AS ENUM ('pending_analysis', 'analyzed', 'failed');

-- 2. Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('brand_inspiration', 'brand_inspiration', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','video/mp4']),
  ('venue_atmosphere',  'venue_atmosphere',  false, 15728640, ARRAY['image/jpeg','image/png','image/webp','video/mp4']),
  ('plating_style',     'plating_style',     false, 5242880, ARRAY['image/jpeg','image/png','image/webp','video/mp4']);

-- 3. style_reference_assets
CREATE TABLE public.style_reference_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  channel       public.style_channel NOT NULL,
  type          public.style_asset_type NOT NULL DEFAULT 'image',
  storage_path  text NOT NULL,
  thumbnail_path text,
  user_notes    text,
  pinned        boolean NOT NULL DEFAULT false,
  status        public.style_asset_status NOT NULL DEFAULT 'pending_analysis',
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.style_reference_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view style assets"
  ON public.style_reference_assets FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Managers/owners can insert style assets"
  ON public.style_reference_assets FOR INSERT
  WITH CHECK (
    is_venue_member(venue_id, auth.uid()) AND (
      is_venue_admin(venue_id, auth.uid()) OR
      (SELECT role FROM public.venue_members WHERE venue_id = style_reference_assets.venue_id AND user_id = auth.uid()) = 'manager'
    )
  );

CREATE POLICY "Managers/owners can update style assets"
  ON public.style_reference_assets FOR UPDATE
  USING (
    is_venue_admin(venue_id, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = style_reference_assets.venue_id AND user_id = auth.uid()) = 'manager'
  );

CREATE POLICY "Managers/owners can delete style assets"
  ON public.style_reference_assets FOR DELETE
  USING (
    is_venue_admin(venue_id, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = style_reference_assets.venue_id AND user_id = auth.uid()) = 'manager'
  );

-- 4. style_analysis
CREATE TABLE public.style_analysis (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  asset_id         uuid NOT NULL REFERENCES public.style_reference_assets(id) ON DELETE CASCADE,
  channel          public.style_channel NOT NULL,
  analysis_json    jsonb NOT NULL DEFAULT '{}',
  summary_text     text,
  embedding        jsonb,
  confidence_score float NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.style_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view style analysis"
  ON public.style_analysis FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Managers/owners can insert style analysis"
  ON public.style_analysis FOR INSERT
  WITH CHECK (
    is_venue_admin(venue_id, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = style_analysis.venue_id AND user_id = auth.uid()) = 'manager'
  );

CREATE POLICY "Managers/owners can update style analysis"
  ON public.style_analysis FOR UPDATE
  USING (
    is_venue_admin(venue_id, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = style_analysis.venue_id AND user_id = auth.uid()) = 'manager'
  );

-- 5. venue_style_profile
CREATE TABLE public.venue_style_profile (
  venue_id          uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  brand_profile     jsonb NOT NULL DEFAULT '{}',
  atmosphere_profile jsonb NOT NULL DEFAULT '{}',
  plating_profile   jsonb NOT NULL DEFAULT '{}',
  merged_profile    jsonb NOT NULL DEFAULT '{}',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_style_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view style profile"
  ON public.venue_style_profile FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Managers/owners can upsert style profile"
  ON public.venue_style_profile FOR INSERT
  WITH CHECK (
    is_venue_admin(venue_id, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = venue_style_profile.venue_id AND user_id = auth.uid()) = 'manager'
  );

CREATE POLICY "Managers/owners can update style profile"
  ON public.venue_style_profile FOR UPDATE
  USING (
    is_venue_admin(venue_id, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = venue_style_profile.venue_id AND user_id = auth.uid()) = 'manager'
  );

-- 6. Storage RLS policies
CREATE POLICY "Members can read brand_inspiration"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand_inspiration' AND is_venue_member(
    (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()
  ));

CREATE POLICY "Managers/owners can upload brand_inspiration"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand_inspiration' AND (
    is_venue_admin((regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid AND user_id = auth.uid()) = 'manager'
  ));

CREATE POLICY "Managers/owners can delete brand_inspiration"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'brand_inspiration' AND (
    is_venue_admin((regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid AND user_id = auth.uid()) = 'manager'
  ));

CREATE POLICY "Members can read venue_atmosphere"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'venue_atmosphere' AND is_venue_member(
    (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()
  ));

CREATE POLICY "Managers/owners can upload venue_atmosphere"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'venue_atmosphere' AND (
    is_venue_admin((regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid AND user_id = auth.uid()) = 'manager'
  ));

CREATE POLICY "Managers/owners can delete venue_atmosphere"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'venue_atmosphere' AND (
    is_venue_admin((regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid AND user_id = auth.uid()) = 'manager'
  ));

CREATE POLICY "Members can read plating_style"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plating_style' AND is_venue_member(
    (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()
  ));

CREATE POLICY "Managers/owners can upload plating_style"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'plating_style' AND (
    is_venue_admin((regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid AND user_id = auth.uid()) = 'manager'
  ));

CREATE POLICY "Managers/owners can delete plating_style"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'plating_style' AND (
    is_venue_admin((regexp_match(name, '^venues/([^/]+)/'))[1]::uuid, auth.uid()) OR
    (SELECT role FROM public.venue_members WHERE venue_id = (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid AND user_id = auth.uid()) = 'manager'
  ));

-- 7. Indexes
CREATE INDEX idx_style_reference_assets_venue ON public.style_reference_assets(venue_id);
CREATE INDEX idx_style_reference_assets_channel ON public.style_reference_assets(venue_id, channel);
CREATE INDEX idx_style_analysis_venue ON public.style_analysis(venue_id);
CREATE INDEX idx_style_analysis_asset ON public.style_analysis(asset_id);
