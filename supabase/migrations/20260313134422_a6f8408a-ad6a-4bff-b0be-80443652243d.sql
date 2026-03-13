
-- Plan outputs (campaign pack copy items)
CREATE TABLE public.plan_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  output_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Plan asset briefs (production briefs)
CREATE TABLE public.plan_asset_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  title text NOT NULL,
  brief text NOT NULL DEFAULT '',
  intended_channel text,
  status text NOT NULL DEFAULT 'not_started',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Plan assets (links between briefs and actual content_assets)
CREATE TABLE public.plan_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  asset_brief_id uuid REFERENCES public.plan_asset_briefs(id) ON DELETE SET NULL,
  content_asset_id uuid REFERENCES public.content_assets(id) ON DELETE SET NULL,
  asset_type text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Plan workspace snapshots (precomputed for fast UI reads)
CREATE TABLE public.plan_workspace_snapshots (
  plan_id uuid PRIMARY KEY REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.plan_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_asset_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_workspace_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Members can manage plan outputs"
  ON public.plan_outputs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id
      WHERE vep.id = plan_outputs.plan_id AND vm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id
      WHERE vep.id = plan_outputs.plan_id AND vm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage plan asset briefs"
  ON public.plan_asset_briefs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id
      WHERE vep.id = plan_asset_briefs.plan_id AND vm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id
      WHERE vep.id = plan_asset_briefs.plan_id AND vm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage plan assets"
  ON public.plan_assets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id
      WHERE vep.id = plan_assets.plan_id AND vm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_event_plans vep
      JOIN public.venue_members vm ON vm.venue_id = vep.venue_id
      WHERE vep.id = plan_assets.plan_id AND vm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage plan snapshots"
  ON public.plan_workspace_snapshots FOR ALL TO authenticated
  USING (public.is_venue_member(venue_id, auth.uid()))
  WITH CHECK (public.is_venue_member(venue_id, auth.uid()));

-- Indexes
CREATE INDEX idx_plan_outputs_plan_id ON public.plan_outputs(plan_id);
CREATE INDEX idx_plan_asset_briefs_plan_id ON public.plan_asset_briefs(plan_id);
CREATE INDEX idx_plan_assets_plan_id ON public.plan_assets(plan_id);
CREATE INDEX idx_plan_assets_brief_id ON public.plan_assets(asset_brief_id);

-- Updated_at triggers
CREATE TRIGGER update_plan_outputs_updated_at BEFORE UPDATE ON public.plan_outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_plan_asset_briefs_updated_at BEFORE UPDATE ON public.plan_asset_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
