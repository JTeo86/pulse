
CREATE TABLE public.waitlist_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  venue_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public waitlist)
CREATE POLICY "Anyone can join the waitlist"
ON public.waitlist_signups
FOR INSERT
WITH CHECK (true);

-- Only platform admins can view signups
CREATE POLICY "Platform admins can view waitlist"
ON public.waitlist_signups
FOR SELECT
USING (is_platform_admin(auth.uid()));
