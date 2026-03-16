
-- Add new columns to plan_publish_items for post pack workflow
ALTER TABLE public.plan_publish_items
  ADD COLUMN IF NOT EXISTS pack_type text NOT NULL DEFAULT 'social',
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;
