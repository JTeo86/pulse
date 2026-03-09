
-- Add video provider columns to editor_jobs
ALTER TABLE public.editor_jobs 
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS source_asset_id uuid REFERENCES public.content_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS output_asset_id uuid REFERENCES public.content_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_settings jsonb DEFAULT '{}'::jsonb;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_editor_jobs_source_asset ON public.editor_jobs(source_asset_id) WHERE source_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_editor_jobs_output_asset ON public.editor_jobs(output_asset_id) WHERE output_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_editor_jobs_provider_job ON public.editor_jobs(provider_job_id) WHERE provider_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_editor_jobs_mode_status ON public.editor_jobs(mode, status);
