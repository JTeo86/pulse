
-- Table for platform-level API keys manageable from admin UI
CREATE TABLE public.platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text NOT NULL UNIQUE,
  key_value text NOT NULL DEFAULT '',
  description text,
  is_configured boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view and manage API keys
CREATE POLICY "Platform admins can manage API keys"
  ON public.platform_api_keys
  FOR ALL
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can view API keys"
  ON public.platform_api_keys
  FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_platform_api_keys_updated_at
  BEFORE UPDATE ON public.platform_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the two required keys
INSERT INTO public.platform_api_keys (key_name, description)
VALUES
  ('SERPAPI_API_KEY', 'API key for SerpAPI (Google Reviews ingestion)'),
  ('APIFY_API_TOKEN', 'API token for Apify (OpenTable Reviews ingestion)');
