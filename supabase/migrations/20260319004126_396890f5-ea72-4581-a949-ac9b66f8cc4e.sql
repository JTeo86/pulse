
-- Revenue feedback table
CREATE TABLE public.plan_revenue_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  feedback_outcome text NOT NULL CHECK (feedback_outcome IN ('covers_up', 'revenue_up', 'no_noticeable_impact')),
  notes text,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id)
);

ALTER TABLE public.plan_revenue_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view feedback"
  ON public.plan_revenue_feedback FOR SELECT TO authenticated
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue members can insert feedback"
  ON public.plan_revenue_feedback FOR INSERT TO authenticated
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue members can update feedback"
  ON public.plan_revenue_feedback FOR UPDATE TO authenticated
  USING (is_venue_member(venue_id, auth.uid()));

-- Venue learning signals table for Lily
CREATE TABLE public.venue_learning_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  category text,
  channel text,
  confidence_score numeric NOT NULL DEFAULT 0.5,
  supporting_count integer NOT NULL DEFAULT 1,
  last_reinforced_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_learning_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view learning signals"
  ON public.venue_learning_signals FOR SELECT TO authenticated
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue members can manage learning signals"
  ON public.venue_learning_signals FOR ALL TO authenticated
  USING (is_venue_member(venue_id, auth.uid()))
  WITH CHECK (is_venue_member(venue_id, auth.uid()));
