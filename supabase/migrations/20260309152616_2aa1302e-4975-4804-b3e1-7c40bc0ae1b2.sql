-- Add website_url and instagram_handle to venues
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS instagram_handle text;

-- Add target_audience and key_selling_points to venue_style_profiles
ALTER TABLE public.venue_style_profiles
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS key_selling_points text;