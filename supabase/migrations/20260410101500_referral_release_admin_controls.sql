-- Referral rollout admin controls: beta mode, venue beta gating, and audit trail.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS referral_beta_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_rollout_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_rollout_changed_by uuid;

INSERT INTO public.platform_settings (key, value)
VALUES
  ('referral_beta_mode', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_rollout_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_scope text NOT NULL CHECK (event_scope IN ('global', 'venue', 'bulk')),
  event_type text NOT NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_rollout_audit_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referral_rollout_audit_events'
      AND policyname = 'Platform admins manage referral rollout audit'
  ) THEN
    CREATE POLICY "Platform admins manage referral rollout audit"
      ON public.referral_rollout_audit_events
      FOR ALL
      USING (is_platform_admin(auth.uid()))
      WITH CHECK (is_platform_admin(auth.uid()));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_referral_rollout_audit_created_at
  ON public.referral_rollout_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_rollout_audit_venue_id
  ON public.referral_rollout_audit_events(venue_id)
  WHERE venue_id IS NOT NULL;
