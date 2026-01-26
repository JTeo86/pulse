-- Create copy_projects table for storing copy generation projects
CREATE TABLE public.copy_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('email', 'blog', 'ad_copy', 'sms_push')),
  goal TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create copy_outputs table for storing generated copy variations
CREATE TABLE public.copy_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.copy_projects(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.copy_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_outputs ENABLE ROW LEVEL SECURITY;

-- RLS policies for copy_projects
CREATE POLICY "Venue members can view copy projects"
ON public.copy_projects
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = copy_projects.venue_id
    AND venue_members.user_id = auth.uid()
  )
);

CREATE POLICY "Venue admins can insert copy projects"
ON public.copy_projects
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = copy_projects.venue_id
    AND venue_members.user_id = auth.uid()
    AND venue_members.role = 'admin'
  )
);

CREATE POLICY "Venue admins can update copy projects"
ON public.copy_projects
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = copy_projects.venue_id
    AND venue_members.user_id = auth.uid()
    AND venue_members.role = 'admin'
  )
);

CREATE POLICY "Venue admins can delete copy projects"
ON public.copy_projects
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = copy_projects.venue_id
    AND venue_members.user_id = auth.uid()
    AND venue_members.role = 'admin'
  )
);

-- RLS policies for copy_outputs (access via project's venue)
CREATE POLICY "Users can view copy outputs of their venues"
ON public.copy_outputs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM copy_projects cp
    JOIN venue_members vm ON vm.venue_id = cp.venue_id
    WHERE cp.id = copy_outputs.project_id
    AND vm.user_id = auth.uid()
  )
);

CREATE POLICY "Venue admins can insert copy outputs"
ON public.copy_outputs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM copy_projects cp
    JOIN venue_members vm ON vm.venue_id = cp.venue_id
    WHERE cp.id = copy_outputs.project_id
    AND vm.user_id = auth.uid()
    AND vm.role = 'admin'
  )
);

CREATE POLICY "Venue admins can update copy outputs"
ON public.copy_outputs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM copy_projects cp
    JOIN venue_members vm ON vm.venue_id = cp.venue_id
    WHERE cp.id = copy_outputs.project_id
    AND vm.user_id = auth.uid()
    AND vm.role = 'admin'
  )
);

CREATE POLICY "Venue admins can delete copy outputs"
ON public.copy_outputs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM copy_projects cp
    JOIN venue_members vm ON vm.venue_id = cp.venue_id
    WHERE cp.id = copy_outputs.project_id
    AND vm.user_id = auth.uid()
    AND vm.role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX idx_copy_projects_venue_id ON public.copy_projects(venue_id);
CREATE INDEX idx_copy_projects_created_at ON public.copy_projects(created_at DESC);
CREATE INDEX idx_copy_outputs_project_id ON public.copy_outputs(project_id);