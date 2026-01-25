-- Add delete policy for uploads table (admin only)
CREATE POLICY "Admins can delete uploads"
ON public.uploads
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = uploads.venue_id
    AND venue_members.user_id = auth.uid()
    AND venue_members.role = 'admin'
  )
);