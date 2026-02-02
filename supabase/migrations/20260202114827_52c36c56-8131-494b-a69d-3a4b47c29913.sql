-- Add platform admin policies for full access to ai_providers and ai_models
-- These are system-wide tables that require special admin access

-- Create a simple platform admin check function
-- For now, admins of any venue can manage platform settings
-- In production, you'd want a dedicated platform_admins table
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_members
    WHERE user_id = check_user_id
      AND role = 'admin'
    LIMIT 1
  )
$$;

-- Allow platform admins to manage ai_providers
CREATE POLICY "Platform admins can manage providers"
ON public.ai_providers FOR ALL
USING (is_platform_admin(auth.uid()));

-- Allow platform admins to view all models (not just approved ones)
CREATE POLICY "Platform admins can view all models"
ON public.ai_providers FOR SELECT
USING (is_platform_admin(auth.uid()));

-- Allow platform admins to manage ai_models
CREATE POLICY "Platform admins can manage models"
ON public.ai_models FOR ALL
USING (is_platform_admin(auth.uid()));

-- Allow platform admins to manage global background_assets (venue_id IS NULL)
CREATE POLICY "Platform admins can manage global backgrounds"
ON public.background_assets FOR ALL
USING (
  venue_id IS NULL 
  AND is_platform_admin(auth.uid())
);

-- Allow platform admins to manage global overlay_templates (venue_id IS NULL)
CREATE POLICY "Platform admins can manage global templates"
ON public.overlay_templates FOR ALL
USING (
  venue_id IS NULL 
  AND is_platform_admin(auth.uid())
);

-- Allow platform admins to manage global feature flags
CREATE POLICY "Platform admins can manage global flags"
ON public.feature_flags FOR ALL
USING (
  venue_id IS NULL 
  AND is_platform_admin(auth.uid())
);