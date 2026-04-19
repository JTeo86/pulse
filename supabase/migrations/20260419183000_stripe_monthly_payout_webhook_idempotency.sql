-- Stripe checkout + webhook flow for one monthly venue payout period.
-- Webhook is source of truth; session creation only creates a pending payment record.
-- This remains one payment per payout period and does not implement partner payouts.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processed',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_created
  ON public.stripe_webhook_events (event_type, created_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Service role manages stripe webhook events"
ON public.stripe_webhook_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.apply_monthly_payout_payment(
  p_period_id uuid,
  p_external_payment_id text,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status text;
BEGIN
  SELECT status INTO v_period_status
  FROM public.payout_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Payout period % not found', p_period_id;
  END IF;

  IF v_period_status = 'paid' THEN
    RETURN 'already_paid';
  END IF;

  UPDATE public.payments
  SET
    status = 'paid',
    external_payment_id = COALESCE(p_external_payment_id, external_payment_id),
    paid_at = COALESCE(paid_at, p_paid_at),
    updated_at = now()
  WHERE payout_period_id = p_period_id
    AND status <> 'paid';

  UPDATE public.payout_periods
  SET
    status = 'paid',
    paid_at = COALESCE(paid_at, p_paid_at),
    stripe_payment_id = COALESCE(p_external_payment_id, stripe_payment_id),
    payment_intent_id = COALESCE(p_external_payment_id, payment_intent_id),
    external_payment_status = 'paid',
    external_payment_reference = COALESCE(p_external_payment_id, external_payment_reference)
  WHERE id = p_period_id;

  UPDATE public.payout_items
  SET
    status = 'paid',
    paid_at = COALESCE(paid_at, p_paid_at),
    updated_at = now()
  WHERE payout_period_id = p_period_id
    AND status <> 'paid'
    AND status <> 'excluded';

  UPDATE public.commissions c
  SET
    status = 'paid',
    paid_at = COALESCE(c.paid_at, p_paid_at)
  FROM public.payout_items pi
  WHERE pi.payout_period_id = p_period_id
    AND pi.status <> 'excluded'
    AND pi.commission_id = c.id
    AND c.status <> 'paid';

  PERFORM public.refresh_payout_period_totals(p_period_id);

  RETURN 'applied';
END;
$$;
