
-- Add RLS policies to guest_submissions for public insert (no auth needed)
ALTER TABLE public.guest_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit guest photos"
ON public.guest_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Venue members can view submissions"
ON public.guest_submissions
FOR SELECT
TO authenticated
USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can update submissions"
ON public.guest_submissions
FOR UPDATE
TO authenticated
USING (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Venue admins can delete submissions"
ON public.guest_submissions
FOR DELETE
TO authenticated
USING (is_venue_admin(venue_id, auth.uid()));

-- Add unique constraint on action_feed_items for upsert support (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_feed_items_venue_action_unique'
  ) THEN
    ALTER TABLE public.action_feed_items ADD CONSTRAINT action_feed_items_venue_action_unique UNIQUE (venue_id, action_type);
  END IF;
END $$;
