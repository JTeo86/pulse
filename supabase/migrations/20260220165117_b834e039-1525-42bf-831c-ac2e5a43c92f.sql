
-- ============================================================
-- EDITOR MODULE DATABASE SCHEMA
-- ============================================================

-- 1. editor_jobs: tracks each Pro Photo / Reel generation job
CREATE TABLE public.editor_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','processing','done','failed')),
  mode text NOT NULL DEFAULT 'pro_photo' CHECK (mode IN ('pro_photo','reel')),
  realism_mode text NOT NULL DEFAULT 'safe' CHECK (realism_mode IN ('safe','enhanced','editorial')),
  style_preset text NOT NULL DEFAULT 'clean_studio' CHECK (style_preset IN ('clean_studio','lifestyle_table','premium_editorial')),
  input_image_url text,
  input_image_width integer,
  input_image_height integer,
  hook_text text,
  cutout_url text,
  replated_url text,
  final_image_url text,
  final_image_variants jsonb,
  final_video_url text,
  fidelity_confirmed boolean NOT NULL DEFAULT false,
  fidelity_confirmed_at timestamp with time zone,
  error_message text
);

ALTER TABLE public.editor_jobs ENABLE ROW LEVEL SECURITY;

-- Venue members can view jobs for their venue
CREATE POLICY "Venue members can view editor jobs"
  ON public.editor_jobs FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

-- Venue members can create jobs
CREATE POLICY "Venue members can create editor jobs"
  ON public.editor_jobs FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()) AND created_by = auth.uid());

-- Venue admins can manage all jobs
CREATE POLICY "Venue admins can manage editor jobs"
  ON public.editor_jobs FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- Creators can update their own jobs
CREATE POLICY "Creators can update their own editor jobs"
  ON public.editor_jobs FOR UPDATE
  USING (is_venue_member(venue_id, auth.uid()) AND created_by = auth.uid());

-- 2. venue_limits: per-venue credit caps
CREATE TABLE public.venue_limits (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  monthly_pro_photo_credits integer NOT NULL DEFAULT 50,
  monthly_reel_credits integer NOT NULL DEFAULT 20,
  reset_day integer NOT NULL DEFAULT 1
);

ALTER TABLE public.venue_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view limits"
  ON public.venue_limits FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage limits"
  ON public.venue_limits FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- 3. editor_usage: monthly usage tracking
CREATE TABLE public.editor_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  month text NOT NULL, -- format: YYYY-MM
  pro_photo_used integer NOT NULL DEFAULT 0,
  reel_used integer NOT NULL DEFAULT 0,
  UNIQUE (venue_id, month)
);

ALTER TABLE public.editor_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view usage"
  ON public.editor_usage FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage usage"
  ON public.editor_usage FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- 4. platform_settings: key/value store for integration config
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage settings"
  ON public.platform_settings FOR ALL
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can view settings"
  ON public.platform_settings FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- 5. Trigger to update editor_jobs.updated_at automatically
CREATE TRIGGER update_editor_jobs_updated_at
  BEFORE UPDATE ON public.editor_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Seed default platform_settings keys
INSERT INTO public.platform_settings (key, value) VALUES
  ('GEMINI_IMAGE_API_KEY', ''),
  ('PHOTOROOM_API_KEY', ''),
  ('REEL_RENDERER_PROVIDER', 'placeholder'),
  ('KLING_API_KEY', '')
ON CONFLICT (key) DO NOTHING;
