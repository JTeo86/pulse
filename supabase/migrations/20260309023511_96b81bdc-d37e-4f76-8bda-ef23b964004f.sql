
-- =============================================
-- REFERRAL NETWORK MODULE - FULL SCHEMA
-- =============================================

-- 1. referral_beta_access
CREATE TABLE public.referral_beta_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_type text NOT NULL CHECK (access_type IN ('venue', 'referrer')),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  email text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_beta_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage beta access" ON public.referral_beta_access FOR ALL USING (is_platform_admin(auth.uid()));
CREATE POLICY "Venue members can view own beta access" ON public.referral_beta_access FOR SELECT USING (venue_id IS NOT NULL AND is_venue_member(venue_id, auth.uid()));

-- 2. referrers
CREATE TABLE public.referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  instagram_handle text,
  role_type text NOT NULL DEFAULT 'other' CHECK (role_type IN ('influencer', 'concierge', 'agent', 'creator', 'planner', 'other')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'paused', 'rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view referrers" ON public.referrers FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage referrers" ON public.referrers FOR ALL USING (is_venue_admin(venue_id, auth.uid()));

-- 3. venue_offers
CREATE TABLE public.venue_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  commission_type text NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venue_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view offers" ON public.venue_offers FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage offers" ON public.venue_offers FOR ALL USING (is_venue_admin(venue_id, auth.uid()));

-- 4. referral_links
CREATE TABLE public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES public.venue_offers(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  destination_url text NOT NULL DEFAULT '',
  qr_code_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view referral links" ON public.referral_links FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage referral links" ON public.referral_links FOR ALL USING (is_venue_admin(venue_id, auth.uid()));

-- 5. referral_clicks
CREATE TABLE public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES public.venue_offers(id) ON DELETE CASCADE,
  referral_link_id uuid NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'link' CHECK (source_type IN ('link', 'qr', 'agent_booking')),
  utm_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view clicks" ON public.referral_clicks FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage clicks" ON public.referral_clicks FOR ALL USING (is_venue_admin(venue_id, auth.uid()));
-- Public insert for click tracking (no auth required)
CREATE POLICY "Public can insert clicks" ON public.referral_clicks FOR INSERT WITH CHECK (true);

-- 6. referral_bookings
CREATE TABLE public.referral_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.venue_offers(id) ON DELETE SET NULL,
  referral_link_id uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  guest_name text,
  booking_source text NOT NULL DEFAULT 'referral_link' CHECK (booking_source IN ('referral_link', 'agent_manual', 'walk_in_qr', 'other')),
  booking_status text NOT NULL DEFAULT 'pending' CHECK (booking_status IN ('pending', 'confirmed', 'attended', 'cancelled')),
  booking_datetime timestamptz,
  party_size integer,
  spend_verified boolean NOT NULL DEFAULT false,
  verified_spend numeric,
  bill_image_url text,
  commission_amount numeric,
  commission_status text NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
ALTER TABLE public.referral_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view bookings" ON public.referral_bookings FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage bookings" ON public.referral_bookings FOR ALL USING (is_venue_admin(venue_id, auth.uid()));

-- 7. payout_batches
CREATE TABLE public.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  batch_month text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid', 'failed')),
  total_commission numeric NOT NULL DEFAULT 0,
  pulse_fee numeric NOT NULL DEFAULT 0,
  net_payout numeric NOT NULL DEFAULT 0,
  stripe_transfer_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz
);
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view payout batches" ON public.payout_batches FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage payout batches" ON public.payout_batches FOR ALL USING (is_venue_admin(venue_id, auth.uid()));

-- 8. payout_items
CREATE TABLE public.payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referral_booking_id uuid NOT NULL REFERENCES public.referral_bookings(id) ON DELETE CASCADE,
  commission_amount numeric NOT NULL DEFAULT 0,
  pulse_fee numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view payout items" ON public.payout_items FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue admins can manage payout items" ON public.payout_items FOR ALL USING (is_venue_admin(venue_id, auth.uid()));

-- 9. referral_audit_events
CREATE TABLE public.referral_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue members can view referral audit" ON public.referral_audit_events FOR SELECT USING (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Venue members can insert referral audit" ON public.referral_audit_events FOR INSERT WITH CHECK (is_venue_member(venue_id, auth.uid()));
CREATE POLICY "Platform admins full access referral audit" ON public.referral_audit_events FOR ALL USING (is_platform_admin(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_referral_beta_access_venue ON public.referral_beta_access(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_referral_beta_access_email ON public.referral_beta_access(email) WHERE email IS NOT NULL;
CREATE INDEX idx_referrers_venue ON public.referrers(venue_id);
CREATE INDEX idx_venue_offers_venue ON public.venue_offers(venue_id);
CREATE INDEX idx_referral_links_venue ON public.referral_links(venue_id);
CREATE INDEX idx_referral_links_code ON public.referral_links(code);
CREATE INDEX idx_referral_clicks_venue ON public.referral_clicks(venue_id);
CREATE INDEX idx_referral_bookings_venue ON public.referral_bookings(venue_id);
CREATE INDEX idx_payout_batches_venue ON public.payout_batches(venue_id);
CREATE INDEX idx_payout_items_batch ON public.payout_items(batch_id);
CREATE INDEX idx_referral_audit_venue ON public.referral_audit_events(venue_id);
