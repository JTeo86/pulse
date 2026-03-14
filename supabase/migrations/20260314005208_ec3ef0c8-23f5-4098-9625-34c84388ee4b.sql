-- Add plan lifecycle columns to venue_event_plans
ALTER TABLE public.venue_event_plans 
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Create venue_weekly_briefs table
CREATE TABLE IF NOT EXISTS public.venue_weekly_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  revenue_summary text NOT NULL DEFAULT '',
  marketing_summary text NOT NULL DEFAULT '',
  menu_insights text NOT NULL DEFAULT '',
  opportunities_detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_uplift text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, week_start)
);

ALTER TABLE public.venue_weekly_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read venue briefs"
  ON public.venue_weekly_briefs FOR SELECT
  TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()));

-- Add metadata column to plan_assets if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'plan_assets' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.plan_assets ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;