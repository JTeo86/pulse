
-- Create venue_invites table to track pending invitations
CREATE TABLE public.venue_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  invited_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  accepted_by uuid NULL,
  CONSTRAINT venue_invites_role_check CHECK (role IN ('admin', 'staff')),
  CONSTRAINT venue_invites_venue_email_unique UNIQUE (venue_id, email)
);

-- Enable RLS
ALTER TABLE public.venue_invites ENABLE ROW LEVEL SECURITY;

-- Venue admins can view invites for their venue
CREATE POLICY "Venue admins can view invites"
  ON public.venue_invites
  FOR SELECT
  USING (is_venue_admin(venue_id, auth.uid()));

-- Venue admins can create invites for their venue
CREATE POLICY "Venue admins can create invites"
  ON public.venue_invites
  FOR INSERT
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

-- Venue admins can update invites for their venue
CREATE POLICY "Venue admins can update invites"
  ON public.venue_invites
  FOR UPDATE
  USING (is_venue_admin(venue_id, auth.uid()));

-- Venue admins can delete invites for their venue
CREATE POLICY "Venue admins can delete invites"
  ON public.venue_invites
  FOR DELETE
  USING (is_venue_admin(venue_id, auth.uid()));

-- Create the accept_venue_invites RPC
-- This runs as the function owner (security definer) so it can bypass RLS
-- to insert into venue_members when there's a matching invite
CREATE OR REPLACE FUNCTION public.accept_venue_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_accepted integer := 0;
  v_invite record;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Get user email from JWT claims
  v_user_email := lower(trim((auth.jwt() ->> 'email')));
  IF v_user_email IS NULL OR v_user_email = '' THEN
    RETURN 0;
  END IF;

  -- For each pending invite matching this email
  FOR v_invite IN
    SELECT * FROM public.venue_invites
    WHERE lower(trim(email)) = v_user_email
      AND accepted_at IS NULL
  LOOP
    -- Add user to venue_members (skip if already a member)
    INSERT INTO public.venue_members (venue_id, user_id, role)
    VALUES (v_invite.venue_id, v_user_id, v_invite.role)
    ON CONFLICT (venue_id, user_id) DO NOTHING;

    -- Mark invite as accepted
    UPDATE public.venue_invites
    SET accepted_at = now(),
        accepted_by = v_user_id
    WHERE id = v_invite.id;

    v_accepted := v_accepted + 1;
  END LOOP;

  RETURN v_accepted;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.accept_venue_invites() TO authenticated;

-- Add unique constraint on venue_members if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venue_members_venue_id_user_id_key'
  ) THEN
    ALTER TABLE public.venue_members ADD CONSTRAINT venue_members_venue_id_user_id_key UNIQUE (venue_id, user_id);
  END IF;
END $$;
