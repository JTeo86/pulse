
-- ============================================================
-- Fix role='admin' policies → use is_venue_admin() instead
-- The venue_members table only has 'manager' and 'staff' roles.
-- Venue admin = venue owner, checked via is_venue_admin().
-- ============================================================

-- brand_assets
DROP POLICY IF EXISTS "Admins can manage brand assets" ON public.brand_assets;
CREATE POLICY "Admins can manage brand assets"
  ON public.brand_assets FOR ALL
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()))
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

-- brand_kit_files
DROP POLICY IF EXISTS "Admins can delete brand kit files" ON public.brand_kit_files;
DROP POLICY IF EXISTS "Admins can insert brand kit files" ON public.brand_kit_files;
CREATE POLICY "Admins can insert brand kit files"
  ON public.brand_kit_files FOR INSERT
  TO authenticated
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));
CREATE POLICY "Admins can delete brand kit files"
  ON public.brand_kit_files FOR DELETE
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()));

-- brand_kits
DROP POLICY IF EXISTS "Admins can manage brand kits" ON public.brand_kits;
CREATE POLICY "Admins can manage brand kits"
  ON public.brand_kits FOR ALL
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()))
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

-- content_items
DROP POLICY IF EXISTS "Admins can manage content items" ON public.content_items;
CREATE POLICY "Admins can manage content items"
  ON public.content_items FOR ALL
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()))
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

-- copy_projects
DROP POLICY IF EXISTS "Venue admins can delete copy projects" ON public.copy_projects;
DROP POLICY IF EXISTS "Venue admins can insert copy projects" ON public.copy_projects;
DROP POLICY IF EXISTS "Venue admins can update copy projects" ON public.copy_projects;
CREATE POLICY "Venue admins can manage copy projects"
  ON public.copy_projects FOR ALL
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()))
  WITH CHECK (is_venue_admin(venue_id, auth.uid()));

-- copy_outputs (needs join through copy_projects for venue_id)
DROP POLICY IF EXISTS "Venue admins can delete copy outputs" ON public.copy_outputs;
DROP POLICY IF EXISTS "Venue admins can insert copy outputs" ON public.copy_outputs;
DROP POLICY IF EXISTS "Venue admins can update copy outputs" ON public.copy_outputs;
CREATE POLICY "Venue admins can manage copy outputs"
  ON public.copy_outputs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.copy_projects cp
      WHERE cp.id = copy_outputs.project_id
        AND is_venue_admin(cp.venue_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.copy_projects cp
      WHERE cp.id = copy_outputs.project_id
        AND is_venue_admin(cp.venue_id, auth.uid())
    )
  );

-- uploads
DROP POLICY IF EXISTS "Admins can delete uploads" ON public.uploads;
CREATE POLICY "Admins can delete uploads"
  ON public.uploads FOR DELETE
  TO authenticated
  USING (is_venue_admin(venue_id, auth.uid()));

-- storage objects (venue-assets bucket admin delete)
DROP POLICY IF EXISTS "Admins can delete files" ON storage.objects;
CREATE POLICY "Admins can delete files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'venue-assets'
    AND is_venue_admin(
      (regexp_match(name, '^venues/([^/]+)/'))[1]::uuid,
      auth.uid()
    )
  );
