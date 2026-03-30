-- Autopilot run diagnostics + partial status alignment

ALTER TABLE public.autopilot_runs
  ADD COLUMN IF NOT EXISTS generated_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS run_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS save_error_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generated_item_payloads jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS saved_library_item_ids uuid[] DEFAULT '{}'::uuid[];

UPDATE public.autopilot_runs
SET
  generated_count = COALESCE(items_generated, 0),
  saved_count = COALESCE(items_saved, 0),
  failed_count = COALESCE(items_failed, GREATEST(COALESCE(items_generated, 0) - COALESCE(items_saved, 0), 0)),
  run_status = CASE
    WHEN status = 'partial_failed' THEN 'partial'
    ELSE status
  END,
  saved_library_item_ids = COALESCE(saved_library_item_ids, content_item_ids, '{}'::uuid[]),
  save_error_details = COALESCE(save_error_details, '[]'::jsonb),
  generated_item_payloads = COALESCE(generated_item_payloads, '[]'::jsonb)
WHERE true;

ALTER TABLE public.autopilot_runs DROP CONSTRAINT IF EXISTS autopilot_runs_status_check;
ALTER TABLE public.autopilot_runs
  ADD CONSTRAINT autopilot_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed'));

ALTER TABLE public.autopilot_runs
  ADD CONSTRAINT autopilot_runs_run_status_check
  CHECK (run_status IN ('pending', 'running', 'completed', 'partial', 'failed'));

UPDATE public.autopilot_runs
SET status = 'partial'
WHERE status = 'partial_failed';
