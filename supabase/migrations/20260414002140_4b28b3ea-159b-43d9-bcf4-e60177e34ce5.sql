
-- subscription_tiers
CREATE TABLE public.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  stripe_price_id_monthly text DEFAULT '',
  monthly_image_quota integer NOT NULL DEFAULT 0,
  monthly_storage_mb integer NOT NULL DEFAULT 0,
  max_users_per_venue integer NOT NULL DEFAULT 1,
  marketplace_access_enabled boolean NOT NULL DEFAULT false,
  video_payg_enabled boolean NOT NULL DEFAULT false,
  feature_summary_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view tiers"
  ON public.subscription_tiers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Platform admins can manage tiers"
  ON public.subscription_tiers FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- venue_subscriptions
CREATE TABLE public.venue_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  subscription_tier_id uuid REFERENCES public.subscription_tiers(id),
  status text NOT NULL DEFAULT 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  pending_change_type text DEFAULT 'none',
  pending_change_tier_id uuid REFERENCES public.subscription_tiers(id),
  pending_change_effective_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id)
);

ALTER TABLE public.venue_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view own subscription"
  ON public.venue_subscriptions FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));

CREATE POLICY "Venue owner can update subscription"
  ON public.venue_subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_owner(venue_id, auth.uid()));

CREATE POLICY "Venue owner can modify subscription"
  ON public.venue_subscriptions FOR UPDATE TO authenticated
  USING (public.is_venue_owner(venue_id, auth.uid()));

-- venue_entitlements
CREATE TABLE public.venue_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE UNIQUE,
  subscription_tier_id uuid REFERENCES public.subscription_tiers(id),
  monthly_image_quota integer NOT NULL DEFAULT 0,
  monthly_storage_mb integer NOT NULL DEFAULT 0,
  max_users_per_venue integer NOT NULL DEFAULT 1,
  marketplace_access_enabled boolean NOT NULL DEFAULT false,
  video_payg_enabled boolean NOT NULL DEFAULT false,
  source_type text NOT NULL DEFAULT 'tier',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view entitlements"
  ON public.venue_entitlements FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));

CREATE POLICY "Owner can upsert entitlements"
  ON public.venue_entitlements FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_owner(venue_id, auth.uid()));

CREATE POLICY "Owner can update entitlements"
  ON public.venue_entitlements FOR UPDATE TO authenticated
  USING (public.is_venue_owner(venue_id, auth.uid()));

-- credit_wallets
CREATE TABLE public.credit_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  credit_type text NOT NULL DEFAULT 'video',
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, credit_type)
);

ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view wallets"
  ON public.credit_wallets FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));

-- credit_ledger
CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  credit_type text NOT NULL DEFAULT 'video',
  delta integer NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view ledger"
  ON public.credit_ledger FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()) OR public.is_venue_owner(venue_id, auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_subscription_tiers_updated_at BEFORE UPDATE ON public.subscription_tiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_venue_subscriptions_updated_at BEFORE UPDATE ON public.venue_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_venue_entitlements_updated_at BEFORE UPDATE ON public.venue_entitlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_credit_wallets_updated_at BEFORE UPDATE ON public.credit_wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
