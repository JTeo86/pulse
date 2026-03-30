-- Setup + Autopilot asset-first settings
ALTER TABLE public.autopilot_settings
  ADD COLUMN IF NOT EXISTS require_asset_for_runs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_copy_only_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'conservative';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'autopilot_settings_mode_check'
      AND conrelid = 'public.autopilot_settings'::regclass
  ) THEN
    ALTER TABLE public.autopilot_settings
      ADD CONSTRAINT autopilot_settings_mode_check
      CHECK (mode IN ('conservative', 'creative'));
  END IF;
END $$;
