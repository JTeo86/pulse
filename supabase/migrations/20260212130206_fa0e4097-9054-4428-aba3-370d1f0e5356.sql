-- Drop the partial unique index that PostgREST can't use for ON CONFLICT
DROP INDEX IF EXISTS idx_events_catalog_source_source_id;

-- Create a non-partial unique index (NULLs are treated as distinct by default)
ALTER TABLE public.events_catalog ADD CONSTRAINT uq_events_catalog_source_source_id UNIQUE (source, source_id);