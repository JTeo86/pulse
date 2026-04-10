-- Monthly payout review window with commission adjustments + disputes.

ALTER TABLE public.payout_periods
  DROP CONSTRAINT IF EXISTS payout_periods_status_check;

ALTER TABLE public.payout_periods
  ADD COLUMN IF NOT EXISTS review_window_ends_at timestamptz;

ALTER TABLE public.payout_periods
  ADD CONSTRAINT payout_periods_status_check
  CHECK (status IN ('open', 'locked', 'review_window', 'final', 'paid', 'overdue'));

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_status_check;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('pending', 'approved', 'locked', 'adjusted', 'disputed', 'final', 'paid'));

CREATE TABLE IF NOT EXISTS public.commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  payout_period_id uuid NOT NULL REFERENCES public.payout_periods(id) ON DELETE CASCADE,
  previous_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN (
    'bill_corrected',
    'partial_refund',
    'full_refund',
    'duplicate',
    'attribution_corrected',
    'invalid_referral',
    'other'
  )),
  reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_commission_id ON public.commission_adjustments(commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_payout_period_id ON public.commission_adjustments(payout_period_id);

ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view commission adjustments" ON public.commission_adjustments;
CREATE POLICY "Venue members can view commission adjustments"
ON public.commission_adjustments FOR SELECT
USING (
  payout_period_id IN (
    SELECT id FROM public.payout_periods pp WHERE is_venue_member(pp.venue_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Venue admins can manage commission adjustments" ON public.commission_adjustments;
CREATE POLICY "Venue admins can manage commission adjustments"
ON public.commission_adjustments FOR ALL
USING (
  payout_period_id IN (
    SELECT id FROM public.payout_periods pp WHERE is_venue_admin(pp.venue_id, auth.uid())
  )
)
WITH CHECK (
  payout_period_id IN (
    SELECT id FROM public.payout_periods pp WHERE is_venue_admin(pp.venue_id, auth.uid())
  )
);

CREATE TABLE IF NOT EXISTS public.commission_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  payout_period_id uuid NOT NULL REFERENCES public.payout_periods(id) ON DELETE CASCADE,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dispute_type text NOT NULL CHECK (dispute_type IN (
    'venue_dispute',
    'partner_dispute',
    'attribution_dispute',
    'booking_validity',
    'amount_dispute',
    'other'
  )),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected', 'escalated')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_disputes_commission_id ON public.commission_disputes(commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_disputes_payout_period_id ON public.commission_disputes(payout_period_id);
CREATE INDEX IF NOT EXISTS idx_commission_disputes_status ON public.commission_disputes(status);

ALTER TABLE public.commission_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue members can view commission disputes" ON public.commission_disputes;
CREATE POLICY "Venue members can view commission disputes"
ON public.commission_disputes FOR SELECT
USING (
  payout_period_id IN (
    SELECT id FROM public.payout_periods pp WHERE is_venue_member(pp.venue_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Venue admins can manage commission disputes" ON public.commission_disputes;
CREATE POLICY "Venue admins can manage commission disputes"
ON public.commission_disputes FOR ALL
USING (
  payout_period_id IN (
    SELECT id FROM public.payout_periods pp WHERE is_venue_admin(pp.venue_id, auth.uid())
  )
)
WITH CHECK (
  payout_period_id IN (
    SELECT id FROM public.payout_periods pp WHERE is_venue_admin(pp.venue_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Partners can open own commission disputes" ON public.commission_disputes;
CREATE POLICY "Partners can open own commission disputes"
ON public.commission_disputes FOR INSERT
WITH CHECK (
  commission_id IN (
    SELECT c.id
    FROM public.commissions c
    JOIN public.referrers r ON r.id = c.partner_id
    WHERE r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Partners can view own commission disputes" ON public.commission_disputes;
CREATE POLICY "Partners can view own commission disputes"
ON public.commission_disputes FOR SELECT
USING (
  commission_id IN (
    SELECT c.id
    FROM public.commissions c
    JOIN public.referrers r ON r.id = c.partner_id
    WHERE r.user_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.referral_enforcement_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN (
    'repeated_unresolved_disputes',
    'repeated_downward_adjustments',
    'unpaid_finalised_periods',
    'repeated_abuse'
  )),
  signal_count int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'flagged', 'resolved')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_enforcement_signals_venue_id ON public.referral_enforcement_signals(venue_id);
CREATE INDEX IF NOT EXISTS idx_referral_enforcement_signals_status ON public.referral_enforcement_signals(status);

ALTER TABLE public.referral_enforcement_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage referral enforcement signals" ON public.referral_enforcement_signals;
CREATE POLICY "Platform admins manage referral enforcement signals"
ON public.referral_enforcement_signals FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.validate_commission_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('approved', 'pending')) OR
      (OLD.status = 'approved' AND NEW.status IN ('locked', 'approved')) OR
      (OLD.status = 'locked' AND NEW.status IN ('adjusted', 'disputed', 'final', 'locked')) OR
      (OLD.status = 'adjusted' AND NEW.status IN ('locked', 'disputed', 'final', 'adjusted')) OR
      (OLD.status = 'disputed' AND NEW.status IN ('locked', 'final', 'disputed')) OR
      (OLD.status = 'final' AND NEW.status IN ('paid', 'final')) OR
      (OLD.status = 'paid' AND NEW.status = 'paid')
    ) THEN
      RAISE EXCEPTION 'Invalid commission status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_commission_review_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status text;
BEGIN
  IF NEW.status = 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.payout_period_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_period_status
  FROM public.payout_periods
  WHERE id = NEW.payout_period_id;

  IF v_period_status = 'paid' THEN
    RAISE EXCEPTION 'Paid commissions cannot be edited';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.commission_value IS DISTINCT FROM OLD.commission_value
      OR NEW.locked_commission_value IS DISTINCT FROM OLD.locked_commission_value
      OR NEW.locked_platform_fee IS DISTINCT FROM OLD.locked_platform_fee
    )
    AND v_period_status <> 'review_window' THEN
    RAISE EXCEPTION 'Commission amount changes are only allowed during review window';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_commission_review_window_trg ON public.commissions;
CREATE TRIGGER enforce_commission_review_window_trg
BEFORE UPDATE ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_commission_review_window();

CREATE OR REPLACE FUNCTION public.enforce_adjustment_review_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.payout_periods
  WHERE id = NEW.payout_period_id;

  IF v_status <> 'review_window' THEN
    RAISE EXCEPTION 'Adjustments are only allowed during review window';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_adjustment_review_window_trg ON public.commission_adjustments;
CREATE TRIGGER enforce_adjustment_review_window_trg
BEFORE INSERT ON public.commission_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_adjustment_review_window();

CREATE OR REPLACE FUNCTION public.apply_commission_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.commissions
  SET
    commission_value = NEW.new_amount,
    locked_commission_value = NEW.new_amount,
    status = 'adjusted'
  WHERE id = NEW.commission_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_commission_adjustment_trg ON public.commission_adjustments;
CREATE TRIGGER apply_commission_adjustment_trg
AFTER INSERT ON public.commission_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.apply_commission_adjustment();

CREATE OR REPLACE FUNCTION public.enforce_dispute_review_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.payout_periods
  WHERE id = NEW.payout_period_id;

  IF v_status <> 'review_window' THEN
    RAISE EXCEPTION 'Disputes can only be opened during review window';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dispute_review_window_trg ON public.commission_disputes;
CREATE TRIGGER enforce_dispute_review_window_trg
BEFORE INSERT ON public.commission_disputes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_dispute_review_window();

CREATE OR REPLACE FUNCTION public.sync_commission_dispute_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.commissions
    SET status = 'disputed'
    WHERE id = NEW.commission_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('resolved', 'rejected') THEN
    UPDATE public.commissions
    SET status = 'locked'
    WHERE id = NEW.commission_id
      AND status = 'disputed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_commission_dispute_status_insert_trg ON public.commission_disputes;
CREATE TRIGGER sync_commission_dispute_status_insert_trg
AFTER INSERT ON public.commission_disputes
FOR EACH ROW
EXECUTE FUNCTION public.sync_commission_dispute_status();

DROP TRIGGER IF EXISTS sync_commission_dispute_status_update_trg ON public.commission_disputes;
CREATE TRIGGER sync_commission_dispute_status_update_trg
AFTER UPDATE OF status ON public.commission_disputes
FOR EACH ROW
EXECUTE FUNCTION public.sync_commission_dispute_status();

CREATE OR REPLACE FUNCTION public.lock_due_payout_periods(p_platform_fee_rate numeric DEFAULT 0.1, p_buffer_days int DEFAULT 7)
RETURNS TABLE(period_id uuid, venue_id uuid, month date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
      status = CASE WHEN c.status IN ('pending', 'approved', 'locked') THEN 'locked' ELSE c.status END
    WHERE c.payout_period_id IN (SELECT id FROM due_periods)
    RETURNING c.payout_period_id
  ), lock_periods AS (
    UPDATE public.payout_periods pp
    SET
      status = 'locked',
      locked_at = now(),
      review_window_ends_at = now() + make_interval(days => p_buffer_days),
      due_at = now() + make_interval(days => p_buffer_days)
    WHERE pp.id IN (SELECT id FROM due_periods)
    RETURNING pp.id, pp.venue_id, pp.month
  )
  SELECT lp.id, lp.venue_id, lp.month FROM lock_periods lp;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_review_window_for_locked_periods()
RETURNS TABLE(period_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH reviewing AS (
    UPDATE public.payout_periods
    SET status = 'review_window'
    WHERE status = 'locked'
    RETURNING id
  )
  SELECT id FROM reviewing;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_review_window_payout_periods()
RETURNS TABLE(period_id uuid, unresolved_disputes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH target_periods AS (
    SELECT id
    FROM public.payout_periods
    WHERE status = 'review_window'
      AND review_window_ends_at IS NOT NULL
      AND review_window_ends_at <= now()
  ), latest_disputes AS (
    SELECT DISTINCT ON (commission_id)
      commission_id,
      status
    FROM public.commission_disputes
    WHERE payout_period_id IN (SELECT id FROM target_periods)
    ORDER BY commission_id, created_at DESC
  ), resolve_ready AS (
    UPDATE public.commissions c
    SET status = 'final'
    FROM latest_disputes d
    WHERE c.id = d.commission_id
      AND c.payout_period_id IN (SELECT id FROM target_periods)
      AND d.status IN ('resolved', 'rejected')
      AND c.status IN ('locked', 'adjusted', 'disputed')
    RETURNING c.id
  ), undisputed AS (
    UPDATE public.commissions c
    SET status = 'final'
    WHERE c.payout_period_id IN (SELECT id FROM target_periods)
      AND c.status IN ('locked', 'adjusted')
      AND NOT EXISTS (
        SELECT 1
        FROM latest_disputes d
        WHERE d.commission_id = c.id
          AND d.status IN ('open', 'escalated')
      )
    RETURNING c.id, c.payout_period_id
  ), finalise_periods AS (
    UPDATE public.payout_periods pp
    SET status = 'final', finalized_at = now()
    WHERE pp.id IN (SELECT id FROM target_periods)
    RETURNING pp.id
  ), unresolved AS (
    SELECT
      c.payout_period_id,
      COUNT(*)::int AS unresolved_disputes
    FROM public.commissions c
    JOIN latest_disputes d ON d.commission_id = c.id
    WHERE c.payout_period_id IN (SELECT id FROM target_periods)
      AND d.status IN ('open', 'escalated')
      AND c.status = 'disputed'
    GROUP BY c.payout_period_id
  )
  SELECT fp.id, COALESCE(u.unresolved_disputes, 0)::int
  FROM finalise_periods fp
  LEFT JOIN unresolved u ON u.payout_period_id = fp.id;
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
  SELECT x.period_id
  FROM public.finalize_review_window_payout_periods() x;
END;
$$;

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
      AND c.status IN ('locked', 'adjusted', 'final', 'paid')
    GROUP BY c.payout_period_id
  ) src
  WHERE pp.id = src.payout_period_id;

  UPDATE public.payout_periods
  SET total_commission = 0, total_platform_fee = 0
  WHERE id = p_period_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.commissions c
      WHERE c.payout_period_id = p_period_id
        AND c.status IN ('locked', 'adjusted', 'final', 'paid')
    );
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
    AND status = 'final';

  PERFORM public.refresh_payout_period_totals(p_period_id);
END;
$$;
