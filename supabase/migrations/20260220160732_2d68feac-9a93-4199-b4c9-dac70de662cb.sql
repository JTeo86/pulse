
-- Add unique constraint on waitlist email to prevent duplicate signups
ALTER TABLE public.waitlist_signups
  ADD CONSTRAINT waitlist_signups_email_unique UNIQUE (email);

-- Add email format validation via trigger (not CHECK constraint to avoid planner issues)
CREATE OR REPLACE FUNCTION public.validate_waitlist_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email !~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;
  -- Trim whitespace
  NEW.email := lower(trim(NEW.email));
  IF NEW.venue_name IS NOT NULL THEN
    NEW.venue_name := trim(NEW.venue_name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_waitlist_email_trigger
  BEFORE INSERT ON public.waitlist_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_waitlist_email();
