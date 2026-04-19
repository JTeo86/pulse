-- Prepare manual referral payouts for future external payment providers (e.g. Stripe Connect).
-- This migration keeps the current manual/ledger payout flow unchanged.

ALTER TABLE public.payout_periods
  ADD COLUMN IF NOT EXISTS total_platform_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_partner_payout numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_payment_status text,
  ADD COLUMN IF NOT EXISTS external_payment_reference text;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_period_id uuid NOT NULL REFERENCES public.payout_periods(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL DEFAULT 0,
  platform_fee_amount numeric NOT NULL DEFAULT 0,
  partner_payout_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  provider text,
  external_payment_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_period_unique ON public.payments(payout_period_id);
CREATE INDEX IF NOT EXISTS idx_payments_venue_created_at ON public.payments(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view payments" ON public.payments;
CREATE POLICY "Venue members can view payments"
ON public.payments FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Venue admins can manage payments" ON public.payments;
CREATE POLICY "Venue admins can manage payments"
ON public.payments FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS external_payout_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS payout_provider text,
  ADD COLUMN IF NOT EXISTS payout_account_reference text,
  ADD COLUMN IF NOT EXISTS payout_onboarding_status text;

CREATE OR REPLACE FUNCTION public.refresh_payout_period_totals(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payout_periods pp
  SET
    total_commission = COALESCE(src.total_commission, 0),
    total_platform_fee = COALESCE(src.total_platform_fee, 0),
    total_partner_payout = COALESCE(src.total_commission, 0) - COALESCE(src.total_platform_fee, 0)
  FROM (
    SELECT
      c.payout_period_id,
      SUM(COALESCE(c.locked_commission_value, c.commission_value, 0)) AS total_commission,
      SUM(COALESCE(c.locked_platform_fee, 0)) AS total_platform_fee
    FROM public.commissions c
    WHERE c.payout_period_id = p_period_id
    GROUP BY c.payout_period_id
  ) src
  WHERE pp.id = src.payout_period_id;

  UPDATE public.payout_periods
  SET total_commission = 0, total_platform_fee = 0, total_partner_payout = 0
  WHERE id = p_period_id
    AND NOT EXISTS (SELECT 1 FROM public.commissions c WHERE c.payout_period_id = p_period_id);
END;
$$;
