-- Add policy to allow reading the demo venue for sample data viewing
CREATE POLICY "Allow public read of demo venue" 
ON public.venues 
FOR SELECT 
USING (id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid);

-- Allow public read of content items for demo venue
CREATE POLICY "Allow public read of demo content items" 
ON public.content_items 
FOR SELECT 
USING (venue_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid);

-- Allow public read of uploads for demo venue
CREATE POLICY "Allow public read of demo uploads" 
ON public.uploads 
FOR SELECT 
USING (venue_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid);

-- Allow public read of brand kit for demo venue
CREATE POLICY "Allow public read of demo brand kit" 
ON public.brand_kits 
FOR SELECT 
USING (venue_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid);

-- Allow public read of brand assets for demo venue
CREATE POLICY "Allow public read of demo brand assets" 
ON public.brand_assets 
FOR SELECT 
USING (venue_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid);