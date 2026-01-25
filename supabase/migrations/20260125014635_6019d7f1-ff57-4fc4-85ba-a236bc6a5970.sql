-- Create brand_kit_files table for brand identity documents
CREATE TABLE public.brand_kit_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  category TEXT DEFAULT 'guidelines',
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.brand_kit_files ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view brand kit files of their venues"
ON public.brand_kit_files
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = brand_kit_files.venue_id
    AND venue_members.user_id = auth.uid()
  )
);

CREATE POLICY "Allow public read of demo brand kit files"
ON public.brand_kit_files
FOR SELECT
USING (venue_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid);

CREATE POLICY "Admins can insert brand kit files"
ON public.brand_kit_files
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = brand_kit_files.venue_id
    AND venue_members.user_id = auth.uid()
    AND venue_members.role = 'admin'
  )
);

CREATE POLICY "Admins can delete brand kit files"
ON public.brand_kit_files
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = brand_kit_files.venue_id
    AND venue_members.user_id = auth.uid()
    AND venue_members.role = 'admin'
  )
);

-- Create index for faster venue lookups
CREATE INDEX idx_brand_kit_files_venue_id ON public.brand_kit_files(venue_id);