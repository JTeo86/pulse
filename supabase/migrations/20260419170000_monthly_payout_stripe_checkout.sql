ALTER TABLE public.payout_periods
  ADD COLUMN IF NOT EXISTS stripe_payment_id text;

UPDATE public.payout_periods
SET stripe_payment_id = payment_intent_id
WHERE stripe_payment_id IS NULL
  AND payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_payout_period_paid(p_period_id uuid, p_payment_intent_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payout_periods
  SET
    status = 'paid',
    paid_at = now(),
    payment_intent_id = p_payment_intent_id,
    stripe_payment_id = p_payment_intent_id
  WHERE id = p_period_id;

  UPDATE public.commissions
  SET status = 'paid', paid_at = now()
  WHERE payout_period_id = p_period_id
    AND status <> 'paid';

  UPDATE public.payout_items
  SET status = 'paid'
  WHERE payout_period_id = p_period_id
    AND status <> 'paid';

  PERFORM public.refresh_payout_period_totals(p_period_id);
END;
$$;
