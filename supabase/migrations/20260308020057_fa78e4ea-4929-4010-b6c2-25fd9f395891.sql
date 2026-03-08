
-- ============================================================
-- Phase 1: Create 4 new venue style tables
-- ============================================================

-- 1. venue_style_profiles
CREATE TABLE public.venue_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  cuisine_type text,
  venue_tone text,
  luxury_level text,
  lighting_mood text,
  colour_palette jsonb NOT NULL DEFAULT '[]'::jsonb,
  table_surface_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  background_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  composition_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  camera_style_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_prompt_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  dish_lock_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand_summary text,
  style_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_style_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view venue style profiles"
  ON public.venue_style_profiles FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can manage venue style profiles"
  ON public.venue_style_profiles FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Members can insert venue style profiles"
  ON public.venue_style_profiles FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Members can update venue style profiles"
  ON public.venue_style_profiles FOR UPDATE
  USING (is_venue_member(venue_id, auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_venue_style_profiles_updated_at
  BEFORE UPDATE ON public.venue_style_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. venue_style_reference_assets
CREATE TABLE public.venue_style_reference_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text,
  source_type text NOT NULL,
  channel text NOT NULL,
  label text,
  notes text,
  pinned boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venue_style_ref_assets_lookup
  ON public.venue_style_reference_assets (venue_id, channel, approved, pinned, created_at DESC);

ALTER TABLE public.venue_style_reference_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view venue style reference assets"
  ON public.venue_style_reference_assets FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can manage venue style reference assets"
  ON public.venue_style_reference_assets FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Members can insert venue style reference assets"
  ON public.venue_style_reference_assets FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Members can update venue style reference assets"
  ON public.venue_style_reference_assets FOR UPDATE
  USING (is_venue_member(venue_id, auth.uid()));

CREATE TRIGGER update_venue_style_reference_assets_updated_at
  BEFORE UPDATE ON public.venue_style_reference_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. venue_style_generation_logs
CREATE TABLE public.venue_style_generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  upload_id uuid,
  edited_asset_id uuid,
  model_name text NOT NULL,
  prompt_text text,
  style_summary_used text,
  reference_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  style_sources_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  dish_lock_applied boolean NOT NULL DEFAULT true,
  retry_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error_json jsonb,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_style_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view venue style generation logs"
  ON public.venue_style_generation_logs FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can manage venue style generation logs"
  ON public.venue_style_generation_logs FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Members can insert venue style generation logs"
  ON public.venue_style_generation_logs FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

-- 4. venue_style_feedback
CREATE TABLE public.venue_style_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  edited_asset_id uuid NOT NULL,
  feedback_type text NOT NULL,
  feedback_reason text,
  feedback_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_style_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view venue style feedback"
  ON public.venue_style_feedback FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Members can insert venue style feedback"
  ON public.venue_style_feedback FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can manage venue style feedback"
  ON public.venue_style_feedback FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));
