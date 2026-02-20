
-- Add snoozed_until to venue_event_plans for Lily snooze feature
ALTER TABLE public.venue_event_plans
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP WITH TIME ZONE;

-- Add default_lead_time_days to venues
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS default_lead_time_days INTEGER NOT NULL DEFAULT 21;
