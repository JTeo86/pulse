
-- ============================================================
-- SYSTEM 6 & 7: Event-driven architecture + Job queue
-- ============================================================

-- System events table for event-driven architecture
CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_system_events_venue ON public.system_events(venue_id);
CREATE INDEX idx_system_events_status ON public.system_events(status) WHERE status = 'pending';
CREATE INDEX idx_system_events_type ON public.system_events(event_type);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to system events"
  ON public.system_events FOR ALL
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "Venue members can view their events"
  ON public.system_events FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue members can create events"
  ON public.system_events FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

-- System jobs table for async heavy tasks
CREATE TABLE public.system_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  job_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX idx_system_jobs_venue ON public.system_jobs(venue_id);
CREATE INDEX idx_system_jobs_status ON public.system_jobs(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_system_jobs_type ON public.system_jobs(job_type);

ALTER TABLE public.system_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins full access to jobs"
  ON public.system_jobs FOR ALL
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "Venue members can view their jobs"
  ON public.system_jobs FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue members can create jobs"
  ON public.system_jobs FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

-- ============================================================
-- SYSTEM 1: Marketing Autopilot
-- ============================================================

CREATE TABLE public.marketing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  plan_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  UNIQUE(venue_id, week_start)
);

CREATE INDEX idx_marketing_plans_venue ON public.marketing_plans(venue_id);
CREATE INDEX idx_marketing_plans_week ON public.marketing_plans(week_start);

ALTER TABLE public.marketing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view marketing plans"
  ON public.marketing_plans FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage marketing plans"
  ON public.marketing_plans FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Venue members can update marketing plans"
  ON public.marketing_plans FOR UPDATE
  USING (is_venue_member(venue_id, auth.uid()));

-- ============================================================
-- SYSTEM 2: Revenue Attribution (placeholder schema)
-- ============================================================

CREATE TABLE public.revenue_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  engagement_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  booking_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  revenue_estimate numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_revenue_signals_venue ON public.revenue_signals(venue_id);

ALTER TABLE public.revenue_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view revenue signals"
  ON public.revenue_signals FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage revenue signals"
  ON public.revenue_signals FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- ============================================================
-- SYSTEM 3: Venue Intelligence Network (placeholder schema)
-- ============================================================

CREATE TABLE public.venue_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type text NOT NULL,
  cuisine_category text,
  city text,
  insight_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venue_insights_type ON public.venue_insights(insight_type);
CREATE INDEX idx_venue_insights_cuisine ON public.venue_insights(cuisine_category);

ALTER TABLE public.venue_insights ENABLE ROW LEVEL SECURITY;

-- Insights are anonymized and readable by all authenticated users
CREATE POLICY "Authenticated users can view insights"
  ON public.venue_insights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins can manage insights"
  ON public.venue_insights FOR ALL
  USING (is_platform_admin(auth.uid()));

-- ============================================================
-- SYSTEM 4: Guest Content Loop (placeholder schema)
-- ============================================================

CREATE TABLE public.guest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  guest_name text,
  image_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  generated_caption text,
  suggested_hashtags text[],
  suggested_post_time timestamptz,
  processed_image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guest_submissions_venue ON public.guest_submissions(venue_id);
CREATE INDEX idx_guest_submissions_status ON public.guest_submissions(status);

ALTER TABLE public.guest_submissions ENABLE ROW LEVEL SECURITY;

-- Public insert for guest uploads (no auth required)
CREATE POLICY "Anyone can submit guest content"
  ON public.guest_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Venue members can view their submissions"
  ON public.guest_submissions FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage submissions"
  ON public.guest_submissions FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));
