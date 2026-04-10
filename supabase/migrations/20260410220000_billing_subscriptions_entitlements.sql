-- Stripe subscription + entitlements foundation

CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  stripe_price_id_monthly text,
  monthly_image_quota integer NOT NULL DEFAULT 0,
  monthly_storage_mb integer NOT NULL DEFAULT 0,
  max_users_per_venue integer NOT NULL DEFAULT 1,
  marketplace_access_enabled boolean NOT NULL DEFAULT false,
  video_payg_enabled boolean NOT NULL DEFAULT false,
  description text,
  feature_summary_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_subscriptions (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_tier_id uuid REFERENCES public.subscription_tiers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  pending_tier_id uuid REFERENCES public.subscription_tiers(id) ON DELETE SET NULL,
  pending_change_type text NOT NULL DEFAULT 'none' CHECK (pending_change_type in ('none','downgrade')),
  pending_change_effective_at timestamptz,
  billing_email text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_entitlements (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  subscription_tier_id uuid REFERENCES public.subscription_tiers(id) ON DELETE SET NULL,
  monthly_image_quota integer NOT NULL DEFAULT 0,
  monthly_storage_mb integer NOT NULL DEFAULT 0,
  max_users_per_venue integer NOT NULL DEFAULT 1,
  marketplace_access_enabled boolean NOT NULL DEFAULT false,
  video_payg_enabled boolean NOT NULL DEFAULT false,
  source_type text NOT NULL DEFAULT 'tier' CHECK (source_type in ('tier','override')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_wallets (
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  credit_type text NOT NULL CHECK (credit_type in ('video')),
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, credit_type)
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  credit_type text NOT NULL CHECK (credit_type in ('video')),
  delta integer NOT NULL,
  reason text NOT NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS storage_used_mb integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_subscription_tiers_sort_order ON public.subscription_tiers(sort_order, name);
CREATE INDEX IF NOT EXISTS idx_venue_subscriptions_subscription_id ON public.venue_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_venue_created ON public.credit_ledger(venue_id, created_at DESC);

-- updated_at triggers
DROP TRIGGER IF EXISTS update_subscription_tiers_updated_at ON public.subscription_tiers;
CREATE TRIGGER update_subscription_tiers_updated_at
  BEFORE UPDATE ON public.subscription_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_venue_subscriptions_updated_at ON public.venue_subscriptions;
CREATE TRIGGER update_venue_subscriptions_updated_at
  BEFORE UPDATE ON public.venue_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_venue_entitlements_updated_at ON public.venue_entitlements;
CREATE TRIGGER update_venue_entitlements_updated_at
  BEFORE UPDATE ON public.venue_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_wallets_updated_at ON public.credit_wallets;
CREATE TRIGGER update_credit_wallets_updated_at
  BEFORE UPDATE ON public.credit_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_tiers' AND policyname = 'Authenticated can read active tiers'
  ) THEN
    CREATE POLICY "Authenticated can read active tiers"
    ON public.subscription_tiers
    FOR SELECT
    TO authenticated
    USING (is_active = true OR is_platform_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_tiers' AND policyname = 'Platform admins manage tiers'
  ) THEN
    CREATE POLICY "Platform admins manage tiers"
    ON public.subscription_tiers
    FOR ALL
    TO authenticated
    USING (is_platform_admin(auth.uid()))
    WITH CHECK (is_platform_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_subscriptions' AND policyname = 'Venue members can read subscriptions'
  ) THEN
    CREATE POLICY "Venue members can read subscriptions"
    ON public.venue_subscriptions
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.owner_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.venue_members vm WHERE vm.venue_id = venue_id AND vm.user_id = auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_subscriptions' AND policyname = 'Service role manages subscriptions'
  ) THEN
    CREATE POLICY "Service role manages subscriptions"
    ON public.venue_subscriptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_entitlements' AND policyname = 'Venue members can read entitlements'
  ) THEN
    CREATE POLICY "Venue members can read entitlements"
    ON public.venue_entitlements
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.owner_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.venue_members vm WHERE vm.venue_id = venue_id AND vm.user_id = auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'venue_entitlements' AND policyname = 'Service role manages entitlements'
  ) THEN
    CREATE POLICY "Service role manages entitlements"
    ON public.venue_entitlements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.platform_settings (key, value)
VALUES
  ('billing_customer_portal_enabled', 'true'),
  ('billing_enforcement_mode', 'soft'),
  ('billing_default_trial_days', '0'),
  ('billing_test_mode_banner', 'false'),
  ('stripe_publishable_key', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_api_keys (key_name, key_value, description, category, is_required, is_secret, is_configured, health_status)
VALUES
  ('STRIPE_SECRET_KEY', '', 'Stripe secret API key used by billing edge functions.', 'Publishing', false, true, false, 'missing'),
  ('STRIPE_WEBHOOK_SECRET', '', 'Stripe webhook signing secret for subscription events.', 'Publishing', false, true, false, 'missing')
ON CONFLICT (key_name) DO NOTHING;
