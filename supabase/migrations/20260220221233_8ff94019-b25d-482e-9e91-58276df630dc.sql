
-- ============================================================
-- Extend platform_api_keys with health tracking + categories
-- ============================================================

ALTER TABLE public.platform_api_keys
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_error text NULL;

-- Constraint check on health_status values
ALTER TABLE public.platform_api_keys
  DROP CONSTRAINT IF EXISTS platform_api_keys_health_status_check;

ALTER TABLE public.platform_api_keys
  ADD CONSTRAINT platform_api_keys_health_status_check
  CHECK (health_status IN ('healthy', 'invalid', 'missing', 'untested'));

-- Constraint check on category values  
ALTER TABLE public.platform_api_keys
  DROP CONSTRAINT IF EXISTS platform_api_keys_category_check;

ALTER TABLE public.platform_api_keys
  ADD CONSTRAINT platform_api_keys_category_check
  CHECK (category IN ('Reviews', 'Editor', 'Publishing', 'Other'));

-- ============================================================
-- Seed / upsert all known keys with correct metadata
-- ============================================================
INSERT INTO public.platform_api_keys (key_name, key_value, description, category, is_required, is_secret, health_status, is_configured)
VALUES
  ('SERPAPI_API_KEY',       '', 'SerpAPI key for Google Maps Reviews scraping',         'Reviews',    true,  true, 'untested', false),
  ('APIFY_API_TOKEN',       '', 'Apify token for OpenTable/TripAdvisor review scraping', 'Reviews',    false, true, 'untested', false),
  ('PHOTOROOM_API_KEY',     '', 'PhotoRoom key for background removal (Editor)',          'Editor',     true,  true, 'untested', false),
  ('GEMINI_IMAGE_API_KEY',  '', 'Google AI Studio key for Gemini image editing',          'Editor',     false, true, 'untested', false),
  ('KLING_API_KEY',         '', 'Kling key for cinematic AI reel generation (optional)',  'Editor',     false, true, 'untested', false),
  ('BUFFER_API_KEY',        '', 'Buffer API key for social media scheduling',             'Publishing', false, true, 'untested', false),
  ('MAKE_WEBHOOK_URL',      '', 'Make.com webhook URL for automation flows',              'Publishing', false, false,'untested', false)
ON CONFLICT (key_name) DO UPDATE SET
  category    = EXCLUDED.category,
  is_required = EXCLUDED.is_required,
  is_secret   = EXCLUDED.is_secret,
  description = CASE WHEN platform_api_keys.description IS NULL OR platform_api_keys.description = '' 
                     THEN EXCLUDED.description 
                     ELSE platform_api_keys.description END;

-- ============================================================
-- Migrate API-key-like entries from platform_settings
-- ============================================================
INSERT INTO public.platform_api_keys (key_name, key_value, description, category, is_secret, health_status, is_configured)
SELECT 
  ps.key,
  ps.value,
  'Migrated from platform_settings',
  CASE 
    WHEN ps.key ILIKE '%SERP%' OR ps.key ILIKE '%APIFY%' THEN 'Reviews'
    WHEN ps.key ILIKE '%PHOTOROOM%' OR ps.key ILIKE '%GEMINI%' OR ps.key ILIKE '%KLING%' THEN 'Editor'
    WHEN ps.key ILIKE '%BUFFER%' OR ps.key ILIKE '%MAKE%' THEN 'Publishing'
    ELSE 'Other'
  END,
  true,
  'untested',
  (ps.value IS NOT NULL AND ps.value <> '')
FROM public.platform_settings ps
WHERE (
  ps.key ILIKE '%API_KEY%'
  OR ps.key ILIKE '%API_TOKEN%'
  OR ps.key ILIKE '%WEBHOOK_URL%'
  OR ps.key ILIKE '%SECRET%'
)
AND NOT EXISTS (
  SELECT 1 FROM public.platform_api_keys pak WHERE pak.key_name = ps.key
)
AND ps.value IS NOT NULL
AND ps.value <> '';

-- ============================================================
-- Update is_configured based on key_value presence
-- ============================================================
UPDATE public.platform_api_keys
SET is_configured = (key_value IS NOT NULL AND key_value <> '');

-- ============================================================
-- Drop old RLS policies and add clean ones
-- ============================================================
DROP POLICY IF EXISTS "Platform admins can manage API keys" ON public.platform_api_keys;
DROP POLICY IF EXISTS "Platform admins can view API keys" ON public.platform_api_keys;

-- Only platform admins can do anything with these keys
CREATE POLICY "Platform admins full access to api keys"
  ON public.platform_api_keys
  FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));
