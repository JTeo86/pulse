-- ============================================
-- TheEditor.ai Database Schema
-- ============================================

-- VENUES TABLE
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- VENUE_MEMBERS TABLE (links users to venues with roles)
CREATE TABLE public.venue_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

ALTER TABLE public.venue_members ENABLE ROW LEVEL SECURITY;

-- BRAND_KITS TABLE
CREATE TABLE public.brand_kits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE UNIQUE,
  preset TEXT DEFAULT 'casual' CHECK (preset IN ('casual', 'midrange', 'luxury')),
  rules_text TEXT,
  example_urls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

-- BRAND_ASSETS TABLE
CREATE TABLE public.brand_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (bucket IN ('background', 'crockery')),
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

-- UPLOADS TABLE
CREATE TABLE public.uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'processing', 'ready')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

-- CONTENT_ITEMS TABLE
CREATE TABLE public.content_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.uploads(id) ON DELETE SET NULL,
  intent TEXT DEFAULT 'standard' CHECK (intent IN ('standard', 'announcement', 'event', 'menu_update', 'seasonal')),
  asset_type TEXT DEFAULT 'static' CHECK (asset_type IN ('static', 'video')),
  caption_draft TEXT,
  caption_final TEXT,
  media_master_url TEXT,
  media_variants JSONB DEFAULT '{}'::jsonb,
  used_background_asset_ids JSONB DEFAULT '[]'::jsonb,
  used_crockery_asset_ids JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'needs_changes', 'approved', 'sent_to_buffer', 'scheduled', 'published', 'failed')),
  buffer_payload JSONB,
  buffer_update_id TEXT,
  scheduled_for TIMESTAMPTZ,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- AUDIT_LOG TABLE
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- VENUES POLICIES
CREATE POLICY "Users can view venues they belong to"
  ON public.venues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = venues.id
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create venues"
  ON public.venues FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update their venues"
  ON public.venues FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = venues.id
      AND venue_members.user_id = auth.uid()
      AND venue_members.role = 'admin'
    )
  );

-- VENUE_MEMBERS POLICIES
CREATE POLICY "Users can view members of their venues"
  ON public.venue_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members AS vm
      WHERE vm.venue_id = venue_members.venue_id
      AND vm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create first membership (become admin)"
  ON public.venue_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Admins can manage venue members"
  ON public.venue_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members AS vm
      WHERE vm.venue_id = venue_members.venue_id
      AND vm.user_id = auth.uid()
      AND vm.role = 'admin'
    )
  );

CREATE POLICY "Admins can update venue members"
  ON public.venue_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members AS vm
      WHERE vm.venue_id = venue_members.venue_id
      AND vm.user_id = auth.uid()
      AND vm.role = 'admin'
    )
  );

-- BRAND_KITS POLICIES
CREATE POLICY "Users can view brand kits of their venues"
  ON public.brand_kits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = brand_kits.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage brand kits"
  ON public.brand_kits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = brand_kits.venue_id
      AND venue_members.user_id = auth.uid()
      AND venue_members.role = 'admin'
    )
  );

-- BRAND_ASSETS POLICIES
CREATE POLICY "Users can view brand assets of their venues"
  ON public.brand_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = brand_assets.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage brand assets"
  ON public.brand_assets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = brand_assets.venue_id
      AND venue_members.user_id = auth.uid()
      AND venue_members.role = 'admin'
    )
  );

-- UPLOADS POLICIES
CREATE POLICY "Users can view uploads of their venues"
  ON public.uploads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = uploads.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Venue members can create uploads"
  ON public.uploads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = uploads.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

-- CONTENT_ITEMS POLICIES
CREATE POLICY "Users can view content items of their venues"
  ON public.content_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = content_items.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage content items"
  ON public.content_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = content_items.venue_id
      AND venue_members.user_id = auth.uid()
      AND venue_members.role = 'admin'
    )
  );

-- AUDIT_LOG POLICIES
CREATE POLICY "Users can view audit logs of their venues"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = audit_log.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Venue members can create audit logs"
  ON public.audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id = audit_log.venue_id
      AND venue_members.user_id = auth.uid()
    )
  );

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-assets', 'venue-assets', true);

-- Storage policies
CREATE POLICY "Users can view files from their venues"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'venue-assets' AND
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id::text = (storage.foldername(name))[2]
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Venue members can upload files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'venue-assets' AND
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id::text = (storage.foldername(name))[2]
      AND venue_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'venue-assets' AND
    EXISTS (
      SELECT 1 FROM public.venue_members
      WHERE venue_members.venue_id::text = (storage.foldername(name))[2]
      AND venue_members.user_id = auth.uid()
      AND venue_members.role = 'admin'
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_brand_kits_updated_at
  BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();