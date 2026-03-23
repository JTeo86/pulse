ALTER TABLE public.editor_jobs DROP CONSTRAINT IF EXISTS editor_jobs_realism_mode_check;
ALTER TABLE public.editor_jobs ADD CONSTRAINT editor_jobs_realism_mode_check 
  CHECK (realism_mode = ANY (ARRAY['authentic_social'::text, 'enhanced'::text, 'campaign'::text, 'reference_match'::text, 'safe'::text, 'editorial'::text]));