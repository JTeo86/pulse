-- Restrict referrer PII (email, full_name, instagram_handle, notes) to venue admins only.
-- Staff/managers should not have access to personal contact details of every referrer.
DROP POLICY IF EXISTS "Venue members can view referrers" ON public.referrers;

CREATE POLICY "Venue admins can view referrers"
  ON public.referrers
  FOR SELECT
  USING (public.is_venue_admin(venue_id, auth.uid()));