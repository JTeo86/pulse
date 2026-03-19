-- Add source tracking columns to content_items for campaign-linked calendar items
ALTER TABLE public.content_items 
  ADD COLUMN IF NOT EXISTS source_plan_publish_item_id uuid REFERENCES public.plan_publish_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_plan_title text;

-- Allow venue members (not just admins) to delete content items
CREATE POLICY "Venue members can delete content items"
  ON public.content_items
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = content_items.venue_id
      AND venue_members.user_id = auth.uid()
  ));

-- Allow venue members to update content items
CREATE POLICY "Venue members can update content items"
  ON public.content_items
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = content_items.venue_id
      AND venue_members.user_id = auth.uid()
  ));

-- Allow venue members to insert content items
CREATE POLICY "Venue members can insert content items"
  ON public.content_items
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM venue_members
    WHERE venue_members.venue_id = content_items.venue_id
      AND venue_members.user_id = auth.uid()
  ));