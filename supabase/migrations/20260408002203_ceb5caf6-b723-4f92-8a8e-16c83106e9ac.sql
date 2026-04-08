-- Drop the old check constraint FIRST
ALTER TABLE public.editor_jobs DROP CONSTRAINT IF EXISTS editor_jobs_realism_mode_check;

-- Migrate ALL existing rows to new values
UPDATE public.editor_jobs SET realism_mode = CASE
  WHEN realism_mode = 'campaign' THEN 'campaign'
  WHEN realism_mode IN ('enhanced', 'editorial', 'authentic_social') THEN 'social_ready'
  ELSE 'backdrop'
END
WHERE realism_mode NOT IN ('social_ready', 'backdrop', 'campaign');

-- Recreate with new allowed values
ALTER TABLE public.editor_jobs ADD CONSTRAINT editor_jobs_realism_mode_check CHECK (realism_mode IN ('social_ready', 'backdrop', 'campaign'));

-- Update the default value
ALTER TABLE public.editor_jobs ALTER COLUMN realism_mode SET DEFAULT 'social_ready';