-- Add invite tracking columns to venue_invites
ALTER TABLE public.venue_invites
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;

-- Tighten delete policy: admins can only delete pending (not yet accepted) invites
DROP POLICY IF EXISTS "Venue admins can delete invites" ON public.venue_invites;
CREATE POLICY "Venue admins can delete pending invites"
  ON public.venue_invites
  FOR DELETE
  USING (
    is_venue_admin(venue_id, auth.uid())
    AND accepted_at IS NULL
  );