
-- Autopilot settings per venue
CREATE TABLE public.autopilot_settings (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', '3x_week', 'weekly')),
  content_volume text NOT NULL DEFAULT 'medium' CHECK (content_volume IN ('low', 'medium', 'high')),
  approval_mode text NOT NULL DEFAULT 'require_approval' CHECK (approval_mode IN ('require_approval', 'auto_schedule')),
  run_time time NOT NULL DEFAULT '09:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autopilot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view autopilot settings"
  ON public.autopilot_settings FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage autopilot settings"
  ON public.autopilot_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_admin(venue_id, auth.uid()) OR public.is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can update autopilot settings"
  ON public.autopilot_settings FOR UPDATE TO authenticated
  USING (public.is_venue_admin(venue_id, auth.uid()) OR public.is_venue_member(venue_id, auth.uid()))
  WITH CHECK (public.is_venue_admin(venue_id, auth.uid()) OR public.is_venue_member(venue_id, auth.uid()));

-- Autopilot run log
CREATE TABLE public.autopilot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_type text NOT NULL CHECK (run_type IN ('daily_content', 'weekly_campaign', 'review_content')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  output_summary jsonb DEFAULT '{}'::jsonb,
  content_item_ids uuid[] DEFAULT '{}',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autopilot_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view autopilot runs"
  ON public.autopilot_runs FOR SELECT TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Service can insert autopilot runs"
  ON public.autopilot_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_venue_member(venue_id, auth.uid()));

-- Index for efficient lookups
CREATE INDEX idx_autopilot_runs_venue_created ON public.autopilot_runs (venue_id, created_at DESC);

-- Trigger to update updated_at on autopilot_settings
CREATE TRIGGER update_autopilot_settings_updated_at
  BEFORE UPDATE ON public.autopilot_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
