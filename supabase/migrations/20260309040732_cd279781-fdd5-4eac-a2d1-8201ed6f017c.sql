-- Drop the redundant single-column unique constraint that conflicts with the composite key
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_external_review_id_unique;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';