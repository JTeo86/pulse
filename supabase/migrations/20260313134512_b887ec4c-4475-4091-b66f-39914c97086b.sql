
-- Add missing columns to system_jobs
ALTER TABLE public.system_jobs ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.venue_event_plans(id) ON DELETE CASCADE;
ALTER TABLE public.system_jobs ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.system_jobs ADD COLUMN IF NOT EXISTS run_after timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.system_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_system_jobs_plan ON public.system_jobs(plan_id);

-- Pulse brain context cache
CREATE TABLE IF NOT EXISTS public.pulse_brain_contexts (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  brand_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  venue_summary text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pulse_brain_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage brain contexts"
  ON public.pulse_brain_contexts FOR ALL TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()))
  WITH CHECK (public.is_venue_member(venue_id, auth.uid()));
