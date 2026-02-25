
-- Table to prevent duplicate weekly automation runs per venue
CREATE TABLE public.review_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'running',
  steps_completed text[] NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, week_start)
);

ALTER TABLE public.review_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view automation runs"
  ON public.review_automation_runs FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage automation runs"
  ON public.review_automation_runs FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- Table for review response tasks (Needs Response workflow)
CREATE TABLE public.review_response_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  source text NOT NULL,
  review_date timestamptz,
  rating numeric,
  author_name text,
  review_text text,
  status text NOT NULL DEFAULT 'pending',
  ai_reason text,
  ai_priority text,
  draft_response text,
  final_response text,
  approved_by_user_id uuid,
  approved_at timestamptz,
  posted_at timestamptz,
  post_status text DEFAULT 'not_posted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, review_id)
);

ALTER TABLE public.review_response_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view response tasks"
  ON public.review_response_tasks FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage response tasks"
  ON public.review_response_tasks FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- Members with manager role can also update tasks (for approving responses)
CREATE POLICY "Venue managers can update response tasks"
  ON public.review_response_tasks FOR UPDATE
  USING (
    (SELECT role FROM public.venue_members 
     WHERE venue_id = review_response_tasks.venue_id 
     AND user_id = auth.uid()) = 'manager'
  );

-- Triggers for updated_at
CREATE TRIGGER update_review_automation_runs_updated_at
  BEFORE UPDATE ON public.review_automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_review_response_tasks_updated_at
  BEFORE UPDATE ON public.review_response_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
