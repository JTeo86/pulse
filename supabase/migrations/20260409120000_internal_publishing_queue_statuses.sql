-- Internal publishing queue statuses with backward-compatible legacy values.
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
    'archived',
    'sent_to_buffer'
  ));
