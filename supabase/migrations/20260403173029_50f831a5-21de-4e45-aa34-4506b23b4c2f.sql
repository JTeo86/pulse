
-- ============================================================
-- FIX 1: autopilot_settings — restrict write to admins/owners only
-- ============================================================
DROP POLICY IF EXISTS "Venue admins can manage autopilot settings" ON public.autopilot_settings;
DROP POLICY IF EXISTS "Venue admins can update autopilot settings" ON public.autopilot_settings;

CREATE POLICY "Venue admins can insert autopilot settings"
  ON public.autopilot_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Venue admins can update autopilot settings"
  ON public.autopilot_settings FOR UPDATE
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()))
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

-- ============================================================
-- FIX 2: venue_atmosphere — make bucket private, remove public read
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'venue_atmosphere';
DROP POLICY IF EXISTS "Public read venue_atmosphere" ON storage.objects;

-- ============================================================
-- FIX 3: guest_submissions — replace open INSERT with venue_id validation
-- ============================================================
DROP POLICY IF EXISTS "Anyone can submit guest content" ON public.guest_submissions;
DROP POLICY IF EXISTS "Anyone can submit guest photos" ON public.guest_submissions;

CREATE POLICY "Public can submit guest photos with valid venue"
  ON public.guest_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id)
    AND image_url IS NOT NULL
    AND length(image_url) > 0
  );

-- ============================================================
-- FIX 4: venue_insights — restrict SELECT to platform admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view insights" ON public.venue_insights;

-- The existing "Platform admins can manage insights" ALL policy already covers admin SELECT.
-- No new policy needed.

-- ============================================================
-- FIX 5: feature_flags — replace open global read with safe function
-- ============================================================

-- Create a security definer function that returns only non-sensitive flag data
CREATE OR REPLACE FUNCTION public.get_safe_feature_flags(p_venue_id uuid DEFAULT NULL)
RETURNS TABLE (
  flag_key text,
  is_enabled boolean,
  config_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ff.flag_key, ff.is_enabled, ff.config_json
  FROM public.feature_flags ff
  WHERE
    -- Global flags (venue_id IS NULL): available to all authenticated users
    (ff.venue_id IS NULL)
    -- Venue-specific flags: only if user is a member
    OR (p_venue_id IS NOT NULL AND ff.venue_id = p_venue_id
        AND is_venue_member(p_venue_id, auth.uid()))
$$;

-- Now restrict the SELECT policy: venue flags to members, global flags to admins only
DROP POLICY IF EXISTS "Users can view their venue feature flags" ON public.feature_flags;

-- Global flags: only platform admins can read directly (the function above provides safe access)
-- Venue flags: venue members can read their own
CREATE POLICY "Venue members can view their venue flags"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (
    (venue_id IS NOT NULL AND is_venue_member(venue_id, auth.uid()))
    OR (venue_id IS NULL AND is_platform_admin(auth.uid()))
  );
