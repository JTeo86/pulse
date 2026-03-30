-- Autopilot + Library refactor: make generated content first-class inventory

-- 1) Extend content_items with explicit source + autopilot metadata
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS run_type text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS hashtags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS content_brief text,
  ADD COLUMN IF NOT EXISTS creative_brief text,
  ADD COLUMN IF NOT EXISTS suggested_scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_tag text,
  ADD COLUMN IF NOT EXISTS autopilot_run_id uuid REFERENCES public.autopilot_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS badges text[] DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_items_source_check'
      AND conrelid = 'public.content_items'::regclass
  ) THEN
    ALTER TABLE public.content_items
      ADD CONSTRAINT content_items_source_check
      CHECK (source IN ('manual', 'autopilot', 'planner'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_items_run_type_check'
      AND conrelid = 'public.content_items'::regclass
  ) THEN
    ALTER TABLE public.content_items
      ADD CONSTRAINT content_items_run_type_check
      CHECK (run_type IS NULL OR run_type IN ('daily_content', 'weekly_campaign', 'review_content'));
  END IF;
END $$;

-- Expand status to support archival + explicit autopilot lifecycle.
ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_status_check
  CHECK (status IN ('draft', 'needs_changes', 'approved', 'sent_to_buffer', 'scheduled', 'published', 'failed', 'archived'));

CREATE INDEX IF NOT EXISTS idx_content_items_venue_source_status_created
  ON public.content_items (venue_id, source, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_autopilot_run
  ON public.content_items (autopilot_run_id);

-- 2) Make autopilot_runs diagnostics explicit
ALTER TABLE public.autopilot_runs
  ADD COLUMN IF NOT EXISTS raw_ai_output text,
  ADD COLUMN IF NOT EXISTS parse_error text,
  ADD COLUMN IF NOT EXISTS items_generated integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_saved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_failed integer NOT NULL DEFAULT 0;

ALTER TABLE public.autopilot_runs DROP CONSTRAINT IF EXISTS autopilot_runs_status_check;
ALTER TABLE public.autopilot_runs
  ADD CONSTRAINT autopilot_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial_failed'));
