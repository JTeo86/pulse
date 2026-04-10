-- Referral rollout controls: global + per-venue

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_stage_override smallint,
  ADD CONSTRAINT venues_referral_stage_override_check
    CHECK (referral_stage_override IS NULL OR referral_stage_override BETWEEN 1 AND 3);

INSERT INTO public.platform_settings (key, value)
VALUES
  ('referral_system_enabled', 'false'),
  ('referral_stage', '1')
ON CONFLICT (key) DO NOTHING;
