-- Canonicalize Buffer queue state to `queued` for V1 publishing clarity.
UPDATE public.content_items
SET status = 'queued'
WHERE status = 'sent_to_buffer';

ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_status_check
  CHECK (status IN (
    'draft',
    'needs_changes',
    'approved',
    'ready',
    'queued',
    'scheduled',
    'exported',
    'published',
    'failed',
    'archived'
  ));
