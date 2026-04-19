-- Minimal monthly payout data layer for referrals.
-- Adds payout period rollup support and payout line-item linkage without changing existing referral logic.

CREATE TABLE IF NOT EXISTS public.payout_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  month date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'paid')),
  total_commission numeric NOT NULL DEFAULT 0,
  total_bookings integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, month)
);

ALTER TABLE public.payout_periods
  ADD COLUMN IF NOT EXISTS total_bookings integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payout_periods_venue_month ON public.payout_periods (venue_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_payout_periods_status ON public.payout_periods (status);

CREATE TABLE IF NOT EXISTS public.payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_period_id uuid NOT NULL REFERENCES public.payout_periods(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'excluded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commission_id)
);

ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS payout_period_id uuid REFERENCES public.payout_periods(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS commission_id uuid REFERENCES public.commissions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep legacy "failed" compatible while supporting new "excluded" status.
ALTER TABLE public.payout_items DROP CONSTRAINT IF EXISTS payout_items_status_check;
ALTER TABLE public.payout_items
  ADD CONSTRAINT payout_items_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'excluded', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_items_commission_id
  ON public.payout_items (commission_id)
  WHERE commission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_items_period_status
  ON public.payout_items (payout_period_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_items_partner_id
  ON public.payout_items (partner_id);
