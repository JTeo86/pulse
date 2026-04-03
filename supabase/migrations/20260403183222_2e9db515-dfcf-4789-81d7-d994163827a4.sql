DROP POLICY IF EXISTS "Owners and managers can update venue members" ON public.venue_members;

CREATE POLICY "Owners and managers can update venue members"
ON public.venue_members FOR UPDATE
USING (
  is_venue_owner(venue_id, auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM venue_members vm2
      WHERE vm2.venue_id = venue_members.venue_id
        AND vm2.user_id = auth.uid()
        AND vm2.role = 'manager'
    )
    AND role = 'staff'
  )
)
WITH CHECK (
  CASE
    WHEN is_venue_owner(venue_id, auth.uid()) THEN true
    ELSE (
      role = 'staff'
      AND user_id IS NOT DISTINCT FROM (
        SELECT vm3.user_id FROM venue_members vm3 WHERE vm3.id = venue_members.id
      )
    )
  END
);