
-- Add missing columns to content_items for Autopilot and Library
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS run_type text,
  ADD COLUMN IF NOT EXISTS autopilot_run_id uuid REFERENCES public.autopilot_runs(id),
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS hashtags text[],
  ADD COLUMN IF NOT EXISTS content_brief text,
  ADD COLUMN IF NOT EXISTS creative_brief text,
  ADD COLUMN IF NOT EXISTS suggested_scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_tag text,
  ADD COLUMN IF NOT EXISTS badges text[],
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS storage_path text;

-- Indexes for library queries
CREATE INDEX IF NOT EXISTS idx_content_items_venue_source ON public.content_items (venue_id, source, status);
CREATE INDEX IF NOT EXISTS idx_content_items_autopilot_run ON public.content_items (autopilot_run_id);

-- Add columns to autopilot_runs for better diagnostics
ALTER TABLE public.autopilot_runs
  ADD COLUMN IF NOT EXISTS run_status text,
  ADD COLUMN IF NOT EXISTS items_generated integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_saved integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_failed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generated_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_library_item_ids text[],
  ADD COLUMN IF NOT EXISTS raw_ai_output text,
  ADD COLUMN IF NOT EXISTS parse_error text,
  ADD COLUMN IF NOT EXISTS save_error_details jsonb,
  ADD COLUMN IF NOT EXISTS generated_item_payloads jsonb;
