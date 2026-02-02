-- Create ENUMs for commercial-safe governance
CREATE TYPE public.commercial_safe_status AS ENUM ('approved', 'blocked', 'review_required');
CREATE TYPE public.license_type AS ENUM ('owned', 'commercial_stock', 'cc0', 'user_uploaded', 'other');
CREATE TYPE public.ai_provider_type AS ENUM ('image', 'video', 'text');
CREATE TYPE public.engine_version AS ENUM ('v1', 'v2');
CREATE TYPE public.venue_vibe AS ENUM ('casual', 'premium', 'luxury', 'nightlife', 'family');

-- ai_providers: Track AI service providers with commercial-use governance
CREATE TABLE public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.ai_provider_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  commercial_use_allowed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  docs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ai_models: Track specific models per provider with commercial safety status
CREATE TABLE public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  task_types TEXT[] NOT NULL DEFAULT '{}',
  commercial_safe_status public.commercial_safe_status NOT NULL DEFAULT 'review_required',
  license_summary TEXT,
  license_url TEXT,
  allow_in_production BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, model_key)
);

-- background_assets: Global and workspace-scoped backgrounds with license tracking
CREATE TABLE public.background_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',
  file_url TEXT NOT NULL,
  storage_path TEXT,
  license_type public.license_type NOT NULL DEFAULT 'user_uploaded',
  license_url TEXT,
  license_proof_file_url TEXT,
  commercial_safe_status public.commercial_safe_status NOT NULL DEFAULT 'review_required',
  allow_in_production BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- overlay_templates: Promo overlay templates with style tags and commercial safety
CREATE TABLE public.overlay_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  layout_schema JSONB NOT NULL DEFAULT '{}',
  preview_url TEXT,
  license_type public.license_type NOT NULL DEFAULT 'owned',
  commercial_safe_status public.commercial_safe_status NOT NULL DEFAULT 'review_required',
  allow_in_production BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- edited_assets: Track all generated/edited outputs with full audit trail
CREATE TABLE public.edited_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source_asset_id UUID,
  source_url TEXT,
  output_urls TEXT[] NOT NULL DEFAULT '{}',
  output_types TEXT[] NOT NULL DEFAULT '{}',
  engine_version public.engine_version NOT NULL DEFAULT 'v1',
  provider_id UUID REFERENCES public.ai_providers(id),
  model_id UUID REFERENCES public.ai_models(id),
  settings_json JSONB NOT NULL DEFAULT '{}',
  compliance_status TEXT DEFAULT 'pending',
  compliance_notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- brand_visual_presets: Workspace-level visual defaults for hospitality vibes
CREATE TABLE public.brand_visual_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  preset_name TEXT NOT NULL,
  vibe public.venue_vibe NOT NULL DEFAULT 'casual',
  grade_settings_json JSONB NOT NULL DEFAULT '{}',
  overlay_style_json JSONB NOT NULL DEFAULT '{}',
  default_background_category TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, preset_name)
);

-- feature_flags: Control V1/V2 engine availability per workspace
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  config_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, flag_key)
);

-- Enable RLS on all tables
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overlay_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edited_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_visual_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_providers (read-only for all authenticated users)
CREATE POLICY "Anyone can view active providers"
ON public.ai_providers FOR SELECT
USING (is_active = true);

-- RLS Policies for ai_models (read-only for all authenticated users)
CREATE POLICY "Anyone can view approved models"
ON public.ai_models FOR SELECT
USING (allow_in_production = true AND commercial_safe_status = 'approved');

-- RLS Policies for background_assets
CREATE POLICY "Users can view global approved backgrounds"
ON public.background_assets FOR SELECT
USING (
  venue_id IS NULL 
  AND allow_in_production = true 
  AND commercial_safe_status = 'approved'
);

CREATE POLICY "Users can view their venue backgrounds"
ON public.background_assets FOR SELECT
USING (
  venue_id IS NOT NULL 
  AND is_venue_member(venue_id, auth.uid())
);

CREATE POLICY "Admins can manage venue backgrounds"
ON public.background_assets FOR ALL
USING (
  venue_id IS NOT NULL 
  AND is_venue_admin(venue_id, auth.uid())
);

-- RLS Policies for overlay_templates
CREATE POLICY "Users can view global approved templates"
ON public.overlay_templates FOR SELECT
USING (
  venue_id IS NULL 
  AND allow_in_production = true 
  AND commercial_safe_status = 'approved'
);

CREATE POLICY "Users can view their venue templates"
ON public.overlay_templates FOR SELECT
USING (
  venue_id IS NOT NULL 
  AND is_venue_member(venue_id, auth.uid())
);

CREATE POLICY "Admins can manage venue templates"
ON public.overlay_templates FOR ALL
USING (
  venue_id IS NOT NULL 
  AND is_venue_admin(venue_id, auth.uid())
);

-- RLS Policies for edited_assets
CREATE POLICY "Users can view their venue edited assets"
ON public.edited_assets FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Users can create edited assets in their venues"
ON public.edited_assets FOR INSERT
WITH CHECK (
  is_venue_member(venue_id, auth.uid()) 
  AND created_by = auth.uid()
);

CREATE POLICY "Admins can manage edited assets"
ON public.edited_assets FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

-- RLS Policies for brand_visual_presets
CREATE POLICY "Users can view their venue presets"
ON public.brand_visual_presets FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can manage venue presets"
ON public.brand_visual_presets FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

-- RLS Policies for feature_flags
CREATE POLICY "Users can view their venue feature flags"
ON public.feature_flags FOR SELECT
USING (
  venue_id IS NULL 
  OR is_venue_member(venue_id, auth.uid())
);

CREATE POLICY "Admins can manage venue feature flags"
ON public.feature_flags FOR ALL
USING (
  venue_id IS NOT NULL 
  AND is_venue_admin(venue_id, auth.uid())
);

-- Trigger for updated_at on brand_visual_presets
CREATE TRIGGER update_brand_visual_presets_updated_at
BEFORE UPDATE ON public.brand_visual_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on feature_flags
CREATE TRIGGER update_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial approved providers
INSERT INTO public.ai_providers (name, type, is_active, commercial_use_allowed, notes, docs_url) VALUES
('PhotoRoom', 'image', true, true, 'Commercial use allowed under paid API plan', 'https://www.photoroom.com/api'),
('Kling', 'video', true, true, 'Commercial use allowed under paid plan (V2 engine)', 'https://klingai.com'),
('Lovable AI', 'image', true, true, 'Built-in Lovable AI models for image generation', NULL);

-- Seed initial approved models for PhotoRoom
INSERT INTO public.ai_models (provider_id, model_key, display_name, task_types, commercial_safe_status, license_summary, allow_in_production)
SELECT 
  id,
  'background-removal',
  'Background Removal',
  ARRAY['background_removal'],
  'approved',
  'Commercial use included in PhotoRoom API subscription',
  true
FROM public.ai_providers WHERE name = 'PhotoRoom';

INSERT INTO public.ai_models (provider_id, model_key, display_name, task_types, commercial_safe_status, license_summary, allow_in_production)
SELECT 
  id,
  'background-replace',
  'Background Replacement',
  ARRAY['background_replacement', 'shadow_generation'],
  'approved',
  'Commercial use included in PhotoRoom API subscription',
  true
FROM public.ai_providers WHERE name = 'PhotoRoom';

INSERT INTO public.ai_models (provider_id, model_key, display_name, task_types, commercial_safe_status, license_summary, allow_in_production)
SELECT 
  id,
  'enhance',
  'Image Enhancement',
  ARRAY['enhance', 'relight'],
  'approved',
  'Commercial use included in PhotoRoom API subscription',
  true
FROM public.ai_providers WHERE name = 'PhotoRoom';

-- Seed Kling model (V2, disabled by default)
INSERT INTO public.ai_models (provider_id, model_key, display_name, task_types, commercial_safe_status, license_summary, allow_in_production)
SELECT 
  id,
  'image-to-video',
  'Image to Video',
  ARRAY['image_to_video', 'motion_template'],
  'approved',
  'Commercial use allowed under Kling paid plan',
  false
FROM public.ai_providers WHERE name = 'Kling';

-- Seed global feature flag for V2 engine (disabled by default)
INSERT INTO public.feature_flags (venue_id, flag_key, is_enabled, config_json)
VALUES (NULL, 'visual_editor_v2', false, '{"description": "V2 Video Engine (Kling)"}');