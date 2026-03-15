
-- Plan publish items table
CREATE TABLE public.plan_publish_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  plan_asset_id UUID REFERENCES public.plan_assets(id) ON DELETE SET NULL,
  content_asset_id UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'instagram_feed',
  caption TEXT DEFAULT '',
  publish_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.plan_publish_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can manage publish items"
  ON public.plan_publish_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id AND vm.user_id = auth.uid()
      WHERE vep.id = plan_publish_items.plan_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id AND vm.user_id = auth.uid()
      WHERE vep.id = plan_publish_items.plan_id
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_plan_publish_items_updated_at
  BEFORE UPDATE ON public.plan_publish_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
