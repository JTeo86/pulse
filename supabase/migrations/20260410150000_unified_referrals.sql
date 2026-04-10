-- Unified referral model supporting direct + promotion methods.

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS partner_type text;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referral_link_id uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('direct', 'link', 'code', 'manual')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'submitted', 'clicked', 'booking_confirmed', 'visited', 'bill_entered', 'verified', 'paid')),
  booking_date timestamptz,
  party_size integer,
  bill_amount numeric,
  commission numeric,
  attribution_confidence text NOT NULL CHECK (attribution_confidence IN ('high', 'medium', 'low')),
  promo_code text,
  guest_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_venue_id ON public.referrals(venue_id);
CREATE INDEX IF NOT EXISTS idx_referrals_partner_id ON public.referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_source_type ON public.referrals(source_type);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_link_id ON public.referrals(referral_link_id) WHERE referral_link_id IS NOT NULL;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view referrals" ON public.referrals;
CREATE POLICY "Venue members can view referrals"
ON public.referrals FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Venue admins can manage referrals" ON public.referrals;
CREATE POLICY "Venue admins can manage referrals"
ON public.referrals FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_referrals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_referrals_updated_at ON public.referrals;
CREATE TRIGGER set_referrals_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.sync_referrals_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_referral_entry(
  p_venue_id uuid,
  p_partner_id uuid,
  p_source_type text,
  p_guest_name text DEFAULT NULL,
  p_booking_date timestamptz DEFAULT NULL,
  p_party_size integer DEFAULT NULL,
  p_bill_amount numeric DEFAULT NULL,
  p_commission numeric DEFAULT NULL,
  p_referral_link_id uuid DEFAULT NULL,
  p_promo_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_referral_id uuid DEFAULT NULL
)
RETURNS public.referrals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral public.referrals;
  v_status text;
  v_confidence text;
BEGIN
  IF p_source_type NOT IN ('direct', 'link', 'code', 'manual') THEN
    RAISE EXCEPTION 'Invalid source_type: %', p_source_type;
  END IF;

  v_status := CASE
    WHEN p_source_type = 'direct' THEN 'submitted'
    WHEN p_source_type = 'link' THEN 'clicked'
    WHEN p_source_type = 'code' THEN 'booking_confirmed'
    ELSE 'created'
  END;

  v_confidence := CASE
    WHEN p_source_type IN ('direct', 'code') THEN 'high'
    WHEN p_source_type = 'link' THEN 'medium'
    ELSE 'low'
  END;

  IF p_referral_id IS NOT NULL THEN
    UPDATE public.referrals
    SET source_type = COALESCE(p_source_type, source_type),
        status = v_status,
        guest_name = COALESCE(p_guest_name, guest_name),
        booking_date = COALESCE(p_booking_date, booking_date),
        party_size = COALESCE(p_party_size, party_size),
        bill_amount = COALESCE(p_bill_amount, bill_amount),
        commission = COALESCE(p_commission, commission),
        referral_link_id = COALESCE(p_referral_link_id, referral_link_id),
        promo_code = COALESCE(p_promo_code, promo_code),
        notes = COALESCE(p_notes, notes),
        attribution_confidence = v_confidence
    WHERE id = p_referral_id
    RETURNING * INTO v_referral;

    IF v_referral.id IS NOT NULL THEN
      RETURN v_referral;
    END IF;
  END IF;

  IF p_source_type = 'code' AND p_promo_code IS NOT NULL THEN
    WITH latest_match AS (
      SELECT id
      FROM public.referrals
      WHERE venue_id = p_venue_id
        AND partner_id = p_partner_id
        AND promo_code = p_promo_code
        AND status IN ('created', 'submitted', 'clicked')
      ORDER BY created_at DESC
      LIMIT 1
    )
    UPDATE public.referrals r
    SET status = 'booking_confirmed',
        source_type = 'code',
        booking_date = COALESCE(p_booking_date, r.booking_date),
        party_size = COALESCE(p_party_size, r.party_size),
        bill_amount = COALESCE(p_bill_amount, r.bill_amount),
        commission = COALESCE(p_commission, r.commission),
        attribution_confidence = 'high',
        notes = COALESCE(p_notes, r.notes)
    FROM latest_match
    WHERE r.id = latest_match.id
    RETURNING r.* INTO v_referral;

    IF v_referral.id IS NOT NULL THEN
      RETURN v_referral;
    END IF;
  END IF;

  INSERT INTO public.referrals (
    venue_id, partner_id, source_type, status, booking_date, party_size,
    bill_amount, commission, attribution_confidence, referral_link_id,
    promo_code, guest_name, notes
  )
  VALUES (
    p_venue_id, p_partner_id, p_source_type, v_status, p_booking_date, p_party_size,
    p_bill_amount, p_commission, v_confidence, p_referral_link_id,
    p_promo_code, p_guest_name, p_notes
  )
  RETURNING * INTO v_referral;

  RETURN v_referral;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_referral_entry(uuid, uuid, text, text, timestamptz, integer, numeric, numeric, uuid, text, text, uuid) TO authenticated;
