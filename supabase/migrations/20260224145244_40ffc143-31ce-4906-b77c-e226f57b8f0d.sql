
-- Add new columns to review_sources
ALTER TABLE public.review_sources
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS external_id_kind TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Create ingestion history table
CREATE TABLE public.review_ingestion_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  source_id UUID REFERENCES public.review_sources(id),
  status TEXT NOT NULL DEFAULT 'error',
  fetched_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  raw_meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.review_ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view ingestion runs"
  ON public.review_ingestion_runs FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage ingestion runs"
  ON public.review_ingestion_runs FOR ALL
  USING (is_venue_admin(venue_id, auth.uid()));

-- Add update trigger for review_sources.updated_at
CREATE TRIGGER update_review_sources_updated_at
  BEFORE UPDATE ON public.review_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
