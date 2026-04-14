
-- referrals: add missing columns
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS bill_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attribution_confidence numeric DEFAULT 1.0;

-- upsert_referral_entry function
CREATE OR REPLACE FUNCTION public.upsert_referral_entry(
  p_venue_id uuid,
  p_partner_id uuid,
  p_guest_name text DEFAULT NULL,
  p_booking_date date DEFAULT NULL,
  p_bill_amount numeric DEFAULT 0,
  p_source_type text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.referrals (venue_id, partner_id, guest_name, booking_date, bill_amount, source_type)
  VALUES (p_venue_id, p_partner_id, p_guest_name, p_booking_date, p_bill_amount, p_source_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
