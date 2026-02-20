
-- Drop the old constraint
ALTER TABLE public.copy_projects
  DROP CONSTRAINT IF EXISTS copy_projects_module_check;

-- Recreate it with 'campaign' included
ALTER TABLE public.copy_projects
  ADD CONSTRAINT copy_projects_module_check
  CHECK (module IN ('email', 'blog', 'ad_copy', 'sms_push', 'campaign'));

-- Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
