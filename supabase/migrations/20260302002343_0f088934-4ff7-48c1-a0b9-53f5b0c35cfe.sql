
-- Make venue_atmosphere bucket PUBLIC
UPDATE storage.buckets SET public = true WHERE id = 'venue_atmosphere';

-- Storage policies for venue_atmosphere (now public)
-- Allow public read
CREATE POLICY "Public read venue_atmosphere"
ON storage.objects FOR SELECT
USING (bucket_id = 'venue_atmosphere');

-- Only authenticated venue members can upload
CREATE POLICY "Venue members can upload atmosphere assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'venue_atmosphere'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'venues'
);

-- Only authenticated venue members can delete
CREATE POLICY "Venue members can delete atmosphere assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'venue_atmosphere'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'venues'
);
