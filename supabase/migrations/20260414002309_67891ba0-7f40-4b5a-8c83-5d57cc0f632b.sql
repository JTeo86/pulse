
-- venues: add referral columns
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_beta_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_stage_override integer,
  ADD COLUMN IF NOT EXISTS referral_rollout_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_rollout_changed_by text;

-- referrers: add partner columns
ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS partner_referral_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_beta_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_stage_override integer,
  ADD COLUMN IF NOT EXISTS partner_rollout_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_rollout_changed_by text;

-- autopilot_settings: add missing columns
ALTER TABLE public.autopilot_settings
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'conservative',
  ADD COLUMN IF NOT EXISTS require_asset_for_runs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_copy_only_fallback boolean NOT NULL DEFAULT false;

-- referral_rollout_audit_events
CREATE TABLE IF NOT EXISTS public.referral_rollout_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_scope text NOT NULL,
  event_type text NOT NULL,
  venue_id text,
  partner_id text,
  actor_user_id text,
  event_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_rollout_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage audit events" ON public.referral_rollout_audit_events FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- referrals (partner-facing)
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  guest_name text,
  booking_date date,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view referrals" ON public.referrals FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));
CREATE POLICY "Partners can view own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.referrers WHERE user_id = auth.uid()));

-- payout_periods
CREATE TABLE IF NOT EXISTS public.payout_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  month text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view payout periods" ON public.payout_periods FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));
CREATE POLICY "Venue owner can manage payout periods" ON public.payout_periods FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id, auth.uid())) WITH CHECK (public.is_venue_owner(venue_id, auth.uid()));

-- commissions
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.referrals(id),
  payout_period_id uuid REFERENCES public.payout_periods(id),
  bill_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0,
  commission_value numeric NOT NULL DEFAULT 0,
  locked_commission_value numeric,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view commissions" ON public.commissions FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));
CREATE POLICY "Partners can view own commissions" ON public.commissions FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.referrers WHERE user_id = auth.uid()));
CREATE POLICY "Venue owner can manage commissions" ON public.commissions FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id, auth.uid())) WITH CHECK (public.is_venue_owner(venue_id, auth.uid()));

-- payouts
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL DEFAULT 0,
  payout_method text NOT NULL DEFAULT 'bank_transfer',
  reference_note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view payouts" ON public.payouts FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));
CREATE POLICY "Venue owner can manage payouts" ON public.payouts FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id, auth.uid())) WITH CHECK (public.is_venue_owner(venue_id, auth.uid()));

-- payout_commissions
CREATE TABLE IF NOT EXISTS public.payout_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.payouts(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue owner can manage payout_commissions" ON public.payout_commissions FOR ALL TO authenticated
  USING (payout_id IN (SELECT id FROM public.payouts WHERE public.is_venue_owner(venue_id, auth.uid())))
  WITH CHECK (payout_id IN (SELECT id FROM public.payouts WHERE public.is_venue_owner(venue_id, auth.uid())));
CREATE POLICY "Venue members can view payout_commissions" ON public.payout_commissions FOR SELECT TO authenticated
  USING (payout_id IN (SELECT id FROM public.payouts WHERE public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid())));

-- commission_disputes
CREATE TABLE IF NOT EXISTS public.commission_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  payout_period_id uuid REFERENCES public.payout_periods(id),
  opened_by uuid,
  dispute_type text NOT NULL DEFAULT 'partner_dispute',
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue owner can manage disputes" ON public.commission_disputes FOR ALL TO authenticated
  USING (commission_id IN (SELECT id FROM public.commissions WHERE public.is_venue_owner(venue_id, auth.uid())))
  WITH CHECK (commission_id IN (SELECT id FROM public.commissions WHERE public.is_venue_owner(venue_id, auth.uid())));
CREATE POLICY "Partners can view own disputes" ON public.commission_disputes FOR SELECT TO authenticated
  USING (opened_by = auth.uid());
CREATE POLICY "Partners can insert disputes" ON public.commission_disputes FOR INSERT TO authenticated
  WITH CHECK (opened_by = auth.uid());
