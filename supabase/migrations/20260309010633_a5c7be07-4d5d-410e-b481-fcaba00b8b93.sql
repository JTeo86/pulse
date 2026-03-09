-- Create action_feed_items table for venue action tracking
CREATE TABLE public.action_feed_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  action_type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  title text NOT NULL,
  description text NOT NULL,
  cta_label text NOT NULL,
  cta_route text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'completed', 'snoozed')),
  source_data jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT action_feed_items_pkey PRIMARY KEY (id),
  CONSTRAINT action_feed_items_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues (id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_action_feed_items_venue_id ON public.action_feed_items (venue_id);
CREATE INDEX idx_action_feed_items_status ON public.action_feed_items (status);
CREATE INDEX idx_action_feed_items_priority ON public.action_feed_items (priority);
CREATE INDEX idx_action_feed_items_venue_status_priority ON public.action_feed_items (venue_id, status, priority, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.action_feed_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view action items from their venue
CREATE POLICY "Users can view venue action items"
ON public.action_feed_items FOR SELECT
TO authenticated
USING (is_venue_member(venue_id, auth.uid()));

-- Policy: Venue members can insert action items (for service/automation use)
CREATE POLICY "Venue members can create action items"
ON public.action_feed_items FOR INSERT
TO authenticated
WITH CHECK (is_venue_member(venue_id, auth.uid()));

-- Policy: Venue members can update action items (mark as completed/dismissed)
CREATE POLICY "Venue members can update action items"
ON public.action_feed_items FOR UPDATE
TO authenticated
USING (is_venue_member(venue_id, auth.uid()));

-- Policy: Admins can delete action items
CREATE POLICY "Venue admins can delete action items"
ON public.action_feed_items FOR DELETE
TO authenticated
USING (is_venue_admin(venue_id, auth.uid()));