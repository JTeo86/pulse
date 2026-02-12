-- Add unique constraint needed for upsert on events_catalog
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_catalog_source_source_id 
ON public.events_catalog (source, source_id) 
WHERE source_id IS NOT NULL;