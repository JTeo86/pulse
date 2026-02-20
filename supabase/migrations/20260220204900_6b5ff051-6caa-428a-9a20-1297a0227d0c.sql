
-- Fix: The check constraint was added but a demo seed row with role='admin'
-- violates it. Drop the constraint, update remaining rows, re-add constraint.

-- 1. Drop the constraint we just added (may or may not exist)
ALTER TABLE public.venue_members
  DROP CONSTRAINT IF EXISTS venue_members_role_check;

-- 2. Ensure ALL rows are migrated (UPDATE already ran but let's be safe)
UPDATE public.venue_members SET role = 'venue_admin' WHERE role = 'admin';
UPDATE public.venue_members SET role = 'staff'       WHERE role NOT IN ('staff', 'manager', 'venue_admin');

-- 3. Re-add check constraint
ALTER TABLE public.venue_members
  ADD CONSTRAINT venue_members_role_check
  CHECK (role IN ('staff', 'manager', 'venue_admin'));

-- 4. Same for venue_invites
ALTER TABLE public.venue_invites
  DROP CONSTRAINT IF EXISTS venue_invites_role_check;

UPDATE public.venue_invites SET role = 'venue_admin' WHERE role = 'admin';
UPDATE public.venue_invites SET role = 'staff'       WHERE role NOT IN ('staff', 'manager', 'venue_admin');

ALTER TABLE public.venue_invites
  ADD CONSTRAINT venue_invites_role_check
  CHECK (role IN ('staff', 'manager', 'venue_admin'));

-- ============================================================
-- role_rank helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
  RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'staff'       THEN 1
    WHEN 'manager'     THEN 2
    WHEN 'venue_admin' THEN 3
    ELSE 0
  END;
$$;

-- ============================================================
-- get_my_venue_role
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_venue_role(p_venue_id uuid)
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.venue_members
  WHERE venue_id = p_venue_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- ============================================================
-- can_manage_member
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_manage_member(p_venue_id uuid, p_target_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.role_rank(caller.role) > public.role_rank(target.role)
  FROM public.venue_members AS caller, public.venue_members AS target
  WHERE caller.venue_id = p_venue_id AND caller.user_id = auth.uid()
    AND target.venue_id = p_venue_id AND target.user_id = p_target_user_id;
$$;

-- ============================================================
-- remove_member (rank-enforced, protects last venue_admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_member(p_venue_id uuid, p_target_user_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT role INTO v_caller_role FROM public.venue_members
  WHERE venue_id = p_venue_id AND user_id = auth.uid();
  IF v_caller_role IS NULL THEN RAISE EXCEPTION 'You are not a member of this venue'; END IF;

  SELECT role INTO v_target_role FROM public.venue_members
  WHERE venue_id = p_venue_id AND user_id = p_target_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Target user is not a member of this venue'; END IF;

  IF public.role_rank(v_caller_role) <= public.role_rank(v_target_role) THEN
    RAISE EXCEPTION 'You do not have permission to remove this member';
  END IF;

  IF v_target_role = 'venue_admin' THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.venue_members
    WHERE venue_id = p_venue_id AND role = 'venue_admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last Venue Admin. Promote another member first.';
    END IF;
  END IF;

  DELETE FROM public.venue_members WHERE venue_id = p_venue_id AND user_id = p_target_user_id;
END;
$$;

-- ============================================================
-- RLS for venue_invites DELETE (rank-based)
-- ============================================================
DROP POLICY IF EXISTS "Venue admins can delete pending invites"     ON public.venue_invites;
DROP POLICY IF EXISTS "Venue admins can delete invites"             ON public.venue_invites;
DROP POLICY IF EXISTS "Admins can delete any pending invite"        ON public.venue_invites;
DROP POLICY IF EXISTS "Managers can delete pending staff invites"   ON public.venue_invites;

CREATE POLICY "Admins can delete any pending invite"
  ON public.venue_invites FOR DELETE
  USING (
    accepted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_id = venue_invites.venue_id
        AND user_id = auth.uid() AND role = 'venue_admin'
    )
  );

CREATE POLICY "Managers can delete pending staff invites"
  ON public.venue_invites FOR DELETE
  USING (
    accepted_at IS NULL
    AND venue_invites.role = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_id = venue_invites.venue_id
        AND user_id = auth.uid() AND role IN ('manager', 'venue_admin')
    )
  );

-- ============================================================
-- Update is_venue_admin + is_platform_admin to use venue_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_venue_admin(check_venue_id uuid, check_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_members
    WHERE venue_id = check_venue_id AND user_id = check_user_id AND role = 'venue_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(check_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venue_members
    WHERE user_id = check_user_id AND role = 'venue_admin' LIMIT 1
  );
$$;
