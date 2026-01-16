-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view members of their venues" ON public.venue_members;
DROP POLICY IF EXISTS "Admins can manage venue members" ON public.venue_members;
DROP POLICY IF EXISTS "Admins can update venue members" ON public.venue_members;
DROP POLICY IF EXISTS "Users can view venues they belong to" ON public.venues;
DROP POLICY IF EXISTS "Admins can update their venues" ON public.venues;

-- Create a security definer function to check venue membership
CREATE OR REPLACE FUNCTION public.is_venue_member(check_venue_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_members
    WHERE venue_id = check_venue_id
      AND user_id = check_user_id
  )
$$;

-- Create a security definer function to check admin status
CREATE OR REPLACE FUNCTION public.is_venue_admin(check_venue_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_members
    WHERE venue_id = check_venue_id
      AND user_id = check_user_id
      AND role = 'admin'
  )
$$;

-- Recreate venue_members policies using the security definer functions
CREATE POLICY "Users can view members of their venues" 
ON public.venue_members 
FOR SELECT 
USING (public.is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Admins can manage venue members" 
ON public.venue_members 
FOR DELETE 
USING (public.is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Admins can update venue members" 
ON public.venue_members 
FOR UPDATE 
USING (public.is_venue_admin(venue_id, auth.uid()));

-- Recreate venues policies using the security definer functions
CREATE POLICY "Users can view venues they belong to" 
ON public.venues 
FOR SELECT 
USING (public.is_venue_member(id, auth.uid()));

CREATE POLICY "Admins can update their venues" 
ON public.venues 
FOR UPDATE 
USING (public.is_venue_admin(id, auth.uid()));