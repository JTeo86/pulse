
-- ================================================================
-- 1. Add owner_user_id to venues
-- ================================================================
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

-- Populate owner_user_id: set to first venue_admin for each venue, or first member if none
UPDATE public.venues v
SET owner_user_id = (
  SELECT vm.user_id
  FROM public.venue_members vm
  WHERE vm.venue_id = v.id
  ORDER BY
    CASE WHEN vm.role IN ('venue_admin', 'admin') THEN 0 ELSE 1 END,
    vm.created_at
  LIMIT 1
)
WHERE v.owner_user_id IS NULL;

-- ================================================================
-- 2. Drop old CHECK constraint on venue_members.role if exists
-- ================================================================
DO $$
BEGIN
  ALTER TABLE public.venue_members DROP CONSTRAINT IF EXISTS venue_members_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ================================================================
-- 3. Standardise venue_members roles: staff | manager only
--    (venue_admin → manager; admin → manager; unknown → staff)
-- ================================================================
UPDATE public.venue_members
SET role = 'manager'
WHERE role IN ('venue_admin', 'admin');

UPDATE public.venue_members
SET role = 'staff'
WHERE role NOT IN ('staff', 'manager');

-- Add new check constraint
ALTER TABLE public.venue_members
  ADD CONSTRAINT venue_members_role_check CHECK (role IN ('staff', 'manager'));

-- ================================================================
-- 4. Standardise venue_invites roles
-- ================================================================
DO $$
BEGIN
  ALTER TABLE public.venue_invites DROP CONSTRAINT IF EXISTS venue_invites_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

UPDATE public.venue_invites
SET role = 'manager'
WHERE role IN ('venue_admin', 'admin');

UPDATE public.venue_invites
SET role = 'staff'
WHERE role NOT IN ('staff', 'manager');

ALTER TABLE public.venue_invites
  ADD CONSTRAINT venue_invites_role_check CHECK (role IN ('staff', 'manager'));

-- ================================================================
-- 5. Update role_rank function (owner handled separately in app)
-- ================================================================
CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'staff'   THEN 1
    WHEN 'manager' THEN 2
    ELSE 0
  END;
$$;

-- ================================================================
-- 6. Update get_my_venue_role
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_my_venue_role(p_venue_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.venue_members
  WHERE venue_id = p_venue_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- ================================================================
-- 7. is_venue_owner helper
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_venue_owner(p_venue_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = p_venue_id AND owner_user_id = p_user_id
  );
$$;

-- ================================================================
-- 8. Update can_manage_member: owner can manage everyone; manager can manage staff
-- ================================================================
CREATE OR REPLACE FUNCTION public.can_manage_member(p_venue_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_target_is_owner boolean;
  v_caller_role text;
  v_target_role text;
BEGIN
  -- Owner cannot be managed by anyone
  SELECT (owner_user_id = p_target_user_id) INTO v_target_is_owner
  FROM public.venues WHERE id = p_venue_id;
  IF v_target_is_owner THEN RETURN false; END IF;

  -- Self cannot be removed
  IF auth.uid() = p_target_user_id THEN RETURN false; END IF;

  -- Is caller the owner?
  SELECT (owner_user_id = auth.uid()) INTO v_caller_is_owner
  FROM public.venues WHERE id = p_venue_id;
  IF v_caller_is_owner THEN RETURN true; END IF;

  -- Manager can manage staff only
  SELECT role INTO v_caller_role FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = auth.uid();
  SELECT role INTO v_target_role FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = p_target_user_id;
  RETURN v_caller_role = 'manager' AND v_target_role = 'staff';
END;
$$;

-- ================================================================
-- 9. Update remove_member: enforce owner model
-- ================================================================
CREATE OR REPLACE FUNCTION public.remove_member(p_venue_id uuid, p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_target_is_owner boolean;
  v_caller_role text;
  v_target_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Cannot remove the venue owner
  SELECT (owner_user_id = p_target_user_id) INTO v_target_is_owner
  FROM public.venues WHERE id = p_venue_id;
  IF v_target_is_owner THEN
    RAISE EXCEPTION 'Cannot remove the venue owner. Transfer ownership first.';
  END IF;

  -- Cannot remove yourself
  IF auth.uid() = p_target_user_id THEN
    RAISE EXCEPTION 'You cannot remove yourself.';
  END IF;

  -- Is caller the owner?
  SELECT (owner_user_id = auth.uid()) INTO v_caller_is_owner
  FROM public.venues WHERE id = p_venue_id;

  IF v_caller_is_owner THEN
    -- Owner can remove anyone
    DELETE FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = p_target_user_id;
    RETURN;
  END IF;

  -- Check caller membership
  SELECT role INTO v_caller_role FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = auth.uid();
  IF v_caller_role IS NULL THEN RAISE EXCEPTION 'You are not a member of this venue.'; END IF;

  SELECT role INTO v_target_role FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = p_target_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Target is not a member of this venue.'; END IF;

  -- Manager can only remove staff
  IF v_caller_role = 'manager' AND v_target_role = 'staff' THEN
    DELETE FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = p_target_user_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'You do not have permission to remove this member.';
END;
$$;

-- ================================================================
-- 10. Transfer ownership RPC
-- ================================================================
CREATE OR REPLACE FUNCTION public.transfer_venue_ownership(p_venue_id uuid, p_new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Only current owner can transfer
  IF NOT (SELECT owner_user_id = auth.uid() FROM public.venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'Only the venue owner can transfer ownership.';
  END IF;

  -- New owner must be a member
  IF NOT EXISTS (SELECT 1 FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = p_new_owner_id) THEN
    RAISE EXCEPTION 'The new owner must already be a member of this venue.';
  END IF;

  -- Transfer
  UPDATE public.venues SET owner_user_id = p_new_owner_id WHERE id = p_venue_id;
END;
$$;

-- ================================================================
-- 11. Update RLS on venues to allow owner updates
-- ================================================================
DROP POLICY IF EXISTS "Admins can update their venues" ON public.venues;
DROP POLICY IF EXISTS "Owners can update their venues" ON public.venues;

CREATE POLICY "Owners can update their venues"
  ON public.venues FOR UPDATE
  USING (owner_user_id = auth.uid());

-- ================================================================
-- 12. Update venue_invites DELETE policies
-- ================================================================
DROP POLICY IF EXISTS "Admins can delete any pending invite" ON public.venue_invites;
DROP POLICY IF EXISTS "Managers can delete pending staff invites" ON public.venue_invites;
DROP POLICY IF EXISTS "Owners can delete any pending invite" ON public.venue_invites;
DROP POLICY IF EXISTS "Managers can cancel staff invites" ON public.venue_invites;

CREATE POLICY "Owners can delete any pending invite"
  ON public.venue_invites FOR DELETE
  USING (
    accepted_at IS NULL
    AND is_venue_owner(venue_id, auth.uid())
  );

CREATE POLICY "Managers can cancel staff invites"
  ON public.venue_invites FOR DELETE
  USING (
    accepted_at IS NULL
    AND role = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_id = venue_invites.venue_id
        AND user_id = auth.uid()
        AND role = 'manager'
    )
  );

-- Update INSERT policy to allow managers to invite staff
DROP POLICY IF EXISTS "Venue admins can create invites" ON public.venue_invites;
CREATE POLICY "Owners and managers can create invites"
  ON public.venue_invites FOR INSERT
  WITH CHECK (
    is_venue_owner(venue_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_id = venue_invites.venue_id
        AND user_id = auth.uid()
        AND role = 'manager'
    )
  );

DROP POLICY IF EXISTS "Venue admins can update invites" ON public.venue_invites;
CREATE POLICY "Owners can update invites"
  ON public.venue_invites FOR UPDATE
  USING (is_venue_owner(venue_id, auth.uid()));

DROP POLICY IF EXISTS "Venue admins can view invites" ON public.venue_invites;
CREATE POLICY "Owners and managers can view invites"
  ON public.venue_invites FOR SELECT
  USING (
    is_venue_owner(venue_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_id = venue_invites.venue_id
        AND user_id = auth.uid()
        AND role IN ('manager')
    )
  );

-- ================================================================
-- 13. Update venue_members policies: owner and manager can manage
-- ================================================================
DROP POLICY IF EXISTS "Admins can manage venue members" ON public.venue_members;
DROP POLICY IF EXISTS "Admins can update venue members" ON public.venue_members;

CREATE POLICY "Owners can manage venue members"
  ON public.venue_members FOR DELETE
  USING (is_venue_owner(venue_id, auth.uid()));

CREATE POLICY "Owners and managers can update venue members"
  ON public.venue_members FOR UPDATE
  USING (
    is_venue_owner(venue_id, auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.venue_members vm2
        WHERE vm2.venue_id = venue_members.venue_id
          AND vm2.user_id = auth.uid()
          AND vm2.role = 'manager'
      )
      AND venue_members.role = 'staff'
    )
  );

-- ================================================================
-- 14. is_venue_admin: treat owner as admin for backward compat
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_venue_admin(check_venue_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (owner_user_id = check_user_id) FROM public.venues WHERE id = check_venue_id;
$$;

-- ================================================================
-- 15. is_platform_admin: check owner_user_id across any venue
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venues
    WHERE owner_user_id = check_user_id
    LIMIT 1
  );
$$;
