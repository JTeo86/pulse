-- Add diagnostic columns to review_sources for per-source health tracking
ALTER TABLE public.review_sources
  ADD COLUMN IF NOT EXISTS last_ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fetch_status text DEFAULT 'never_run',
  ADD COLUMN IF NOT EXISTS last_fetch_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS last_response_meta jsonb DEFAULT '{}'::jsonb;