
-- 1) Add location columns to venues (additive only)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric;

-- 2) events_catalog
CREATE TABLE public.events_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_id text,
  country_code text,
  city text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  title text NOT NULL,
  category text,
  url text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_events_catalog_source_id
  ON public.events_catalog (source, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX idx_events_catalog_country ON public.events_catalog (country_code, starts_at);

ALTER TABLE public.events_catalog ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read events_catalog
CREATE POLICY "Authenticated users can view events"
  ON public.events_catalog FOR SELECT
  TO authenticated
  USING (true);

-- Platform admins can manage events_catalog
CREATE POLICY "Platform admins can manage events catalog"
  ON public.events_catalog FOR ALL
  USING (is_platform_admin(auth.uid()));

-- 3) venue_event_plans
CREATE TABLE public.venue_event_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events_catalog(id) ON DELETE SET NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'not_started',
  decision jsonb NOT NULL DEFAULT '{}',
  skip_reason text,
  ai_recommendation jsonb,
  deployed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vep_venue ON public.venue_event_plans (venue_id, starts_at);
CREATE INDEX idx_vep_status ON public.venue_event_plans (status);

ALTER TABLE public.venue_event_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view event plans"
  ON public.venue_event_plans FOR SELECT
  USING (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue members can create event plans"
  ON public.venue_event_plans FOR INSERT
  WITH CHECK (is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can update event plans"
  ON public.venue_event_plans FOR UPDATE
  USING (is_venue_admin(venue_id, auth.uid()));

CREATE POLICY "Venue admins can delete event plans"
  ON public.venue_event_plans FOR DELETE
  USING (is_venue_admin(venue_id, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_venue_event_plans_updated_at
  BEFORE UPDATE ON public.venue_event_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) event_plan_tasks
CREATE TABLE public.event_plan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_plan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tasks via plan membership"
  ON public.event_plan_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_tasks.plan_id AND vm.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert tasks via plan membership"
  ON public.event_plan_tasks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_tasks.plan_id AND vm.user_id = auth.uid()
  ));

CREATE POLICY "Users can update tasks via plan membership"
  ON public.event_plan_tasks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_tasks.plan_id AND vm.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete tasks via plan membership"
  ON public.event_plan_tasks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_tasks.plan_id AND vm.user_id = auth.uid()
  ));

CREATE TRIGGER update_event_plan_tasks_updated_at
  BEFORE UPDATE ON public.event_plan_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) event_plan_links
CREATE TABLE public.event_plan_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_event_plans(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  copy_project_id uuid REFERENCES public.copy_projects(id) ON DELETE SET NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_plan_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view links via plan membership"
  ON public.event_plan_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_links.plan_id AND vm.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert links via plan membership"
  ON public.event_plan_links FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_links.plan_id AND vm.user_id = auth.uid()
  ));

CREATE POLICY "Users can update links via plan membership"
  ON public.event_plan_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_links.plan_id AND vm.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete links via plan membership"
  ON public.event_plan_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.venue_event_plans p
    JOIN public.venue_members vm ON vm.venue_id = p.venue_id
    WHERE p.id = event_plan_links.plan_id AND vm.user_id = auth.uid()
  ));

CREATE TRIGGER update_event_plan_links_updated_at
  BEFORE UPDATE ON public.event_plan_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
