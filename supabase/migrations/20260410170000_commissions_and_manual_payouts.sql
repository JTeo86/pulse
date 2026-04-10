-- Stage 1 referral commission + payout ledger.
-- Pulse calculates earnings; venues execute payouts manually.

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  bill_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0,
  commission_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'payable', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referral_id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_partner_id ON public.commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_venue_id ON public.commissions(venue_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.commissions(status);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view commissions" ON public.commissions;
CREATE POLICY "Venue members can view commissions"
ON public.commissions FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Venue admins can manage commissions" ON public.commissions;
CREATE POLICY "Venue admins can manage commissions"
ON public.commissions FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Partners can view own commissions" ON public.commissions;
CREATE POLICY "Partners can view own commissions"
ON public.commissions FOR SELECT
USING (partner_id IN (
  SELECT id FROM public.referrers WHERE user_id = auth.uid()
));

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed')),
  payout_method text,
  reference_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_partner_id ON public.payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_payouts_venue_id ON public.payouts(venue_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view payouts" ON public.payouts;
CREATE POLICY "Venue members can view payouts"
ON public.payouts FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Venue admins can manage payouts" ON public.payouts;
CREATE POLICY "Venue admins can manage payouts"
ON public.payouts FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Partners can view own payouts" ON public.payouts;
CREATE POLICY "Partners can view own payouts"
ON public.payouts FOR SELECT
USING (partner_id IN (
  SELECT id FROM public.referrers WHERE user_id = auth.uid()
));

CREATE TABLE IF NOT EXISTS public.payout_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.payouts(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commission_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_commissions_payout_id ON public.payout_commissions(payout_id);

ALTER TABLE public.payout_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view payout commissions" ON public.payout_commissions;
CREATE POLICY "Venue members can view payout commissions"
ON public.payout_commissions FOR SELECT
USING (
  payout_id IN (
    SELECT id FROM public.payouts p WHERE is_venue_member(p.venue_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Venue admins can manage payout commissions" ON public.payout_commissions;
CREATE POLICY "Venue admins can manage payout commissions"
ON public.payout_commissions FOR ALL
USING (
  payout_id IN (
    SELECT id FROM public.payouts p WHERE is_venue_admin(p.venue_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Partners can view own payout commissions" ON public.payout_commissions;
CREATE POLICY "Partners can view own payout commissions"
ON public.payout_commissions FOR SELECT
USING (
  payout_id IN (
    SELECT id FROM public.payouts p
    JOIN public.referrers r ON r.id = p.partner_id
    WHERE r.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.validate_commission_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('approved', 'pending')) OR
      (OLD.status = 'approved' AND NEW.status IN ('payable', 'approved')) OR
      (OLD.status = 'payable' AND NEW.status IN ('paid', 'payable')) OR
      (OLD.status = 'paid' AND NEW.status = 'paid')
    ) THEN
      RAISE EXCEPTION 'Invalid commission status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_commission_status_transition_trg ON public.commissions;
CREATE TRIGGER validate_commission_status_transition_trg
BEFORE UPDATE ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION public.validate_commission_status_transition();

CREATE OR REPLACE FUNCTION public.sync_commission_from_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill numeric;
  v_value numeric;
  v_rate numeric;
BEGIN
  IF NEW.status IN ('verified', 'paid') AND NEW.bill_amount IS NOT NULL THEN
    v_bill := COALESCE(NEW.bill_amount, 0);
    v_value := COALESCE(NEW.commission, 0);
    v_rate := CASE WHEN v_bill > 0 THEN ROUND((v_value / v_bill), 6) ELSE 0 END;

    INSERT INTO public.commissions (referral_id, partner_id, venue_id, bill_amount, commission_rate, commission_value, status)
    VALUES (
      NEW.id,
      NEW.partner_id,
      NEW.venue_id,
      v_bill,
      v_rate,
      v_value,
      CASE WHEN NEW.status = 'paid' THEN 'paid' ELSE 'pending' END
    )
    ON CONFLICT (referral_id)
    DO UPDATE SET
      partner_id = EXCLUDED.partner_id,
      venue_id = EXCLUDED.venue_id,
      bill_amount = EXCLUDED.bill_amount,
      commission_rate = EXCLUDED.commission_rate,
      commission_value = EXCLUDED.commission_value,
      status = CASE
        WHEN public.commissions.status = 'paid' THEN 'paid'
        WHEN NEW.status = 'paid' THEN 'paid'
        ELSE public.commissions.status
      END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_commission_from_referral_trg ON public.referrals;
CREATE TRIGGER sync_commission_from_referral_trg
AFTER INSERT OR UPDATE OF status, bill_amount, commission ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.sync_commission_from_referral();
