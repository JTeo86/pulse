-- Fix 1: Restrict key_value exposure from platform_api_keys
-- Drop the overly permissive ALL policy
DROP POLICY IF EXISTS "Platform admins full access to api keys" ON public.platform_api_keys;

-- Create separate SELECT policy (still admin-only, but we'll use a view to hide key_value)
CREATE POLICY "Platform admins can select api keys"
  ON public.platform_api_keys FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Create separate INSERT policy
CREATE POLICY "Platform admins can insert api keys"
  ON public.platform_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Create separate UPDATE policy
CREATE POLICY "Platform admins can update api keys"
  ON public.platform_api_keys FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Create separate DELETE policy
CREATE POLICY "Platform admins can delete api keys"
  ON public.platform_api_keys FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Revoke direct SELECT on key_value from anon and authenticated roles
REVOKE ALL ON public.platform_api_keys FROM anon, authenticated;

-- Grant SELECT on specific columns only (excluding key_value)
GRANT SELECT (id, key_name, description, category, is_required, is_secret, is_configured, health_status, last_checked_at, last_error, created_at, updated_at) ON public.platform_api_keys TO authenticated;

-- Grant INSERT and UPDATE on all columns for admin writes (RLS enforces admin check)
GRANT INSERT, UPDATE, DELETE ON public.platform_api_keys TO authenticated;