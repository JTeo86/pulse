-- Monthly batch payouts with lock/finalize/pay lifecycle.

CREATE TABLE IF NOT EXISTS public.payout_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  month date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'final', 'paid', 'overdue')),
  total_commission numeric NOT NULL DEFAULT 0,
  total_platform_fee numeric NOT NULL DEFAULT 0,
  payment_intent_id text,
  locked_at timestamptz,
  finalized_at timestamptz,
  paid_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, month)
);

CREATE INDEX IF NOT EXISTS idx_payout_periods_venue_month ON public.payout_periods(venue_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_payout_periods_status ON public.payout_periods(status);

ALTER TABLE public.payout_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view payout periods" ON public.payout_periods;
CREATE POLICY "Venue members can view payout periods"
ON public.payout_periods FOR SELECT
USING (is_venue_member(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Venue admins can manage payout periods" ON public.payout_periods;
CREATE POLICY "Venue admins can manage payout periods"
ON public.payout_periods FOR ALL
USING (is_venue_admin(venue_id, auth.uid()));

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS payout_period_id uuid REFERENCES public.payout_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_commission_value numeric,
  ADD COLUMN IF NOT EXISTS locked_platform_fee numeric,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_commissions_payout_period_id ON public.commissions(payout_period_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_periods_touch_updated_at_trg ON public.payout_periods;
CREATE TRIGGER payout_periods_touch_updated_at_trg
BEFORE UPDATE ON public.payout_periods
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_open_payout_period(p_venue_id uuid, p_month date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.payout_periods (venue_id, month, status)
  VALUES (p_venue_id, p_month, 'open')
  ON CONFLICT (venue_id, month) DO NOTHING;

  SELECT id INTO v_period_id
  FROM public.payout_periods
  WHERE venue_id = p_venue_id AND month = p_month;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_commission_to_payout_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date;
BEGIN
  v_month := date_trunc('month', COALESCE(NEW.created_at, now()))::date;

  IF NEW.payout_period_id IS NULL THEN
    NEW.payout_period_id := public.ensure_open_payout_period(NEW.venue_id, v_month);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_commission_to_payout_period_trg ON public.commissions;
CREATE TRIGGER assign_commission_to_payout_period_trg
BEFORE INSERT ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION public.assign_commission_to_payout_period();

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
    total_platform_fee = COALESCE(src.total_platform_fee, 0)
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
  SET total_commission = 0, total_platform_fee = 0
  WHERE id = p_period_id
    AND NOT EXISTS (SELECT 1 FROM public.commissions c WHERE c.payout_period_id = p_period_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payout_period_totals_from_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payout_period_id IS NOT NULL THEN
      PERFORM public.refresh_payout_period_totals(OLD.payout_period_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.payout_period_id IS NOT NULL THEN
    PERFORM public.refresh_payout_period_totals(NEW.payout_period_id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.payout_period_id IS DISTINCT FROM NEW.payout_period_id AND OLD.payout_period_id IS NOT NULL THEN
    PERFORM public.refresh_payout_period_totals(OLD.payout_period_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_payout_period_totals_from_commission_trg ON public.commissions;
CREATE TRIGGER refresh_payout_period_totals_from_commission_trg
AFTER INSERT OR UPDATE OR DELETE ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION public.refresh_payout_period_totals_from_commission();

CREATE OR REPLACE FUNCTION public.lock_due_payout_periods(p_platform_fee_rate numeric DEFAULT 0.1, p_buffer_days int DEFAULT 7)
RETURNS TABLE(period_id uuid, venue_id uuid, month date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH due_periods AS (
    SELECT id
    FROM public.payout_periods
    WHERE status = 'open'
      AND month < date_trunc('month', now())::date
  ), lock_commissions AS (
    UPDATE public.commissions c
    SET
      locked_commission_value = COALESCE(c.locked_commission_value, c.commission_value),
      locked_platform_fee = COALESCE(c.locked_platform_fee, ROUND(COALESCE(c.commission_value, 0) * p_platform_fee_rate, 2)),
      locked_at = COALESCE(c.locked_at, now()),
      status = CASE WHEN c.status = 'paid' THEN 'paid' ELSE 'payable' END
    WHERE c.payout_period_id IN (SELECT id FROM due_periods)
    RETURNING c.payout_period_id
  ), lock_periods AS (
    UPDATE public.payout_periods pp
    SET
      status = 'locked',
      locked_at = now(),
      due_at = now() + make_interval(days => p_buffer_days)
    WHERE pp.id IN (SELECT id FROM due_periods)
    RETURNING pp.id, pp.venue_id, pp.month
  )
  RETURN QUERY
  SELECT lp.id, lp.venue_id, lp.month FROM lock_periods lp;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_locked_payout_periods()
RETURNS TABLE(period_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH finalized AS (
    UPDATE public.payout_periods
    SET status = 'final', finalized_at = now()
    WHERE status = 'locked'
      AND due_at IS NOT NULL
      AND due_at <= now()
    RETURNING id
  )
  SELECT id FROM finalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_overdue_payout_periods(p_grace_days int DEFAULT 7)
RETURNS TABLE(period_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH overdue AS (
    UPDATE public.payout_periods
    SET status = 'overdue'
    WHERE status = 'final'
      AND finalized_at IS NOT NULL
      AND finalized_at + make_interval(days => p_grace_days) < now()
    RETURNING id
  )
  SELECT id FROM overdue;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_payout_period_paid(p_period_id uuid, p_payment_intent_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payout_periods
  SET status = 'paid', paid_at = now(), payment_intent_id = p_payment_intent_id
  WHERE id = p_period_id
    AND status IN ('final', 'overdue');

  UPDATE public.commissions
  SET status = 'paid', paid_at = now()
  WHERE payout_period_id = p_period_id
    AND status <> 'paid';

  PERFORM public.refresh_payout_period_totals(p_period_id);
END;
$$;
