
-- Fix 1: Venue members privilege escalation
-- Drop existing INSERT and UPDATE policies
DROP POLICY IF EXISTS "Owners and managers can add venue members" ON public.venue_members;
DROP POLICY IF EXISTS "Owners and managers can update venue members" ON public.venue_members;

-- Recreate INSERT policy: owners can insert any role, managers can only insert 'staff'
CREATE POLICY "Owners and managers can add venue members"
ON public.venue_members FOR INSERT TO authenticated
WITH CHECK (
  CASE
    WHEN is_venue_owner(venue_id, auth.uid()) THEN true
    WHEN (SELECT vm.role FROM public.venue_members vm WHERE vm.venue_id = venue_members.venue_id AND vm.user_id = auth.uid()) = 'manager'
      THEN role = 'staff'
    ELSE false
  END
);

-- Recreate UPDATE policy: owners can update to any role, managers can only update staff and result must stay 'staff'
CREATE POLICY "Owners and managers can update venue members"
ON public.venue_members FOR UPDATE TO authenticated
USING (
  is_venue_owner(venue_id, auth.uid())
  OR (
    EXISTS (SELECT 1 FROM public.venue_members vm2 WHERE vm2.venue_id = venue_members.venue_id AND vm2.user_id = auth.uid() AND vm2.role = 'manager')
    AND role = 'staff'
  )
)
WITH CHECK (
  CASE
    WHEN is_venue_owner(venue_id, auth.uid()) THEN true
    ELSE role = 'staff'
  END
);

-- Fix 2: Guest submissions URL validation trigger
CREATE OR REPLACE FUNCTION public.validate_guest_submission_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate image_url is a proper HTTP(S) URL
  IF NEW.image_url !~* '^https?://[^\s]+$' THEN
    RAISE EXCEPTION 'Invalid image URL format';
  END IF;
  -- Trim and sanitize guest_name
  IF NEW.guest_name IS NOT NULL THEN
    NEW.guest_name := left(trim(NEW.guest_name), 100);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_guest_submission_before_insert
  BEFORE INSERT ON public.guest_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_guest_submission_url();
