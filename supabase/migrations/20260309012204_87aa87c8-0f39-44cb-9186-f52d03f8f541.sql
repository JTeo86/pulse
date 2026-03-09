-- Add unique constraint for idempotent upserts on action_feed_items
ALTER TABLE public.action_feed_items
ADD CONSTRAINT action_feed_items_venue_action_unique UNIQUE (venue_id, action_type);