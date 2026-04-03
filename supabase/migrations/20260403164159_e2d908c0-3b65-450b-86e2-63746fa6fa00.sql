-- Fix 3: Referral clicks - require valid referral_link_id with active status
DROP POLICY IF EXISTS "Public can insert clicks" ON public.referral_clicks;
CREATE POLICY "Public can insert validated clicks"
  ON public.referral_clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.referral_links rl
      WHERE rl.id = referral_link_id
        AND rl.status = 'active'
    )
  );