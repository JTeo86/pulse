-- Drop overly permissive upload/delete policies on venue_atmosphere
DROP POLICY IF EXISTS "Venue members can upload atmosphere assets" ON storage.objects;
DROP POLICY IF EXISTS "Venue members can delete atmosphere assets" ON storage.objects;

-- Recreate with venue membership check via path: venues/<venue_id>/...
CREATE POLICY "Venue members can upload atmosphere assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'venue_atmosphere'
  AND (storage.foldername(name))[1] = 'venues'
  AND public.is_venue_member(
    ((storage.foldername(name))[2])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Venue members can delete atmosphere assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'venue_atmosphere'
  AND (storage.foldername(name))[1] = 'venues'
  AND public.is_venue_member(
    ((storage.foldername(name))[2])::uuid,
    auth.uid()
  )
);