-- Make venue-assets bucket private
UPDATE storage.buckets SET public = false WHERE id = 'venue-assets';