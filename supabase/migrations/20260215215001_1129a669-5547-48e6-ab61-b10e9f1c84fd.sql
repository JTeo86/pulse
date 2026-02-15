
-- Table 1: review_sources
CREATE TABLE public.review_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('google', 'opentable')),
  external_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, source)
);

ALTER TABLE public.review_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view review sources"
  ON public.review_sources FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage review sources"
  ON public.review_sources FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- Table 2: reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('google', 'opentable')),
  external_review_id text NOT NULL,
  author_name text,
  rating numeric,
  review_text text,
  review_date timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_review_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view reviews"
  ON public.reviews FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage reviews"
  ON public.reviews FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- Table 3: weekly_review_reports
CREATE TABLE public.weekly_review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  stats jsonb,
  summary_md text,
  action_items jsonb,
  reply_templates jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, week_start, week_end)
);

ALTER TABLE public.weekly_review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view weekly reports"
  ON public.weekly_review_reports FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage weekly reports"
  ON public.weekly_review_reports FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));
