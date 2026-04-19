-- Small, safe partner referral identity MVP.
-- Adds partner-level referral identity and lightweight click logging without changing payout logic.

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referral_slug text,
  ADD COLUMN IF NOT EXISTS referral_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.generate_partner_referral_code(full_name text, partner_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned text;
  suffix text;
BEGIN
  cleaned := upper(regexp_replace(coalesce(full_name, ''), '[^A-Za-z0-9]+', '', 'g'));
  cleaned := left(cleaned, 8);
  IF cleaned = '' THEN
    cleaned := 'PARTNER';
  END IF;

  suffix := upper(replace(substr(partner_id::text, 1, 4), '-', ''));
  RETURN cleaned || '-' || suffix;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_partner_referral_slug(full_name text, partner_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned text;
  suffix text;
BEGIN
  cleaned := lower(regexp_replace(coalesce(full_name, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  cleaned := regexp_replace(cleaned, '(^-+|-+$)', '', 'g');
  cleaned := left(cleaned, 24);
  IF cleaned = '' THEN
    cleaned := 'partner';
  END IF;

  suffix := substr(replace(partner_id::text, '-', ''), 1, 6);
  RETURN cleaned || '-' || suffix;
END;
$$;

UPDATE public.referrers
SET
  referral_code = COALESCE(referral_code, public.generate_partner_referral_code(full_name, id)),
  referral_slug = COALESCE(referral_slug, public.generate_partner_referral_slug(full_name, id))
WHERE referral_code IS NULL OR referral_slug IS NULL;

ALTER TABLE public.referrers
  ALTER COLUMN referral_code SET NOT NULL,
  ALTER COLUMN referral_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_referral_code_unique ON public.referrers(referral_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_referral_slug_unique ON public.referrers(referral_slug);

CREATE OR REPLACE FUNCTION public.ensure_referrer_referral_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_partner_referral_code(NEW.full_name, NEW.id);
  END IF;

  IF NEW.referral_slug IS NULL THEN
    NEW.referral_slug := public.generate_partner_referral_slug(NEW.full_name, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referrers_referral_identity ON public.referrers;
CREATE TRIGGER trg_referrers_referral_identity
BEFORE INSERT ON public.referrers
FOR EACH ROW
EXECUTE FUNCTION public.ensure_referrer_referral_identity();

CREATE TABLE IF NOT EXISTS public.partner_referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  referral_code text NOT NULL,
  destination_url text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text
);

CREATE INDEX IF NOT EXISTS idx_partner_referral_clicks_partner_id
  ON public.partner_referral_clicks(partner_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_referral_clicks_venue_id
  ON public.partner_referral_clicks(venue_id, clicked_at DESC);

ALTER TABLE public.partner_referral_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view partner referral clicks" ON public.partner_referral_clicks;
CREATE POLICY "Venue members can view partner referral clicks"
ON public.partner_referral_clicks
FOR SELECT
TO authenticated
USING (venue_id IS NOT NULL AND is_venue_member(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Partners can view own referral clicks" ON public.partner_referral_clicks;
CREATE POLICY "Partners can view own referral clicks"
ON public.partner_referral_clicks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.referrers r
    WHERE r.id = partner_referral_clicks.partner_id
      AND r.email = auth.email()
  )
);

DROP POLICY IF EXISTS "Public can insert partner referral clicks" ON public.partner_referral_clicks;
CREATE POLICY "Public can insert partner referral clicks"
ON public.partner_referral_clicks
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
