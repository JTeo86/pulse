-- Add unique constraint for weekly report upserts
ALTER TABLE public.weekly_review_reports
ADD CONSTRAINT weekly_review_reports_venue_week_unique UNIQUE (venue_id, week_start, week_end);

-- Add unique constraint for review deduplication
ALTER TABLE public.reviews
ADD CONSTRAINT reviews_external_review_id_unique UNIQUE (external_review_id);