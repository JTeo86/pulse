-- Fix: Tighten referral_clicks INSERT policy to validate field consistency
DROP POLICY IF EXISTS "Public can insert validated clicks" ON public.referral_clicks;

CREATE POLICY "Public can insert validated clicks"
ON public.referral_clicks FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.referral_links rl
    WHERE rl.id = referral_clicks.referral_link_id
      AND rl.status = 'active'
      AND rl.venue_id = referral_clicks.venue_id
      AND rl.referrer_id = referral_clicks.referrer_id
      AND rl.offer_id = referral_clicks.offer_id
  )
);