-- Partner referral rollout controls and audit support.

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS partner_referral_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_beta_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_stage_override integer,
  ADD COLUMN IF NOT EXISTS partner_rollout_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_rollout_changed_by uuid;

ALTER TABLE public.referrers
  DROP CONSTRAINT IF EXISTS referrers_partner_stage_override_check;

ALTER TABLE public.referrers
  ADD CONSTRAINT referrers_partner_stage_override_check
  CHECK (partner_stage_override IS NULL OR partner_stage_override BETWEEN 1 AND 3);

ALTER TABLE public.referral_rollout_audit_events
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.referrers(id) ON DELETE CASCADE;

ALTER TABLE public.referral_rollout_audit_events
  DROP CONSTRAINT IF EXISTS referral_rollout_audit_events_event_scope_check;

ALTER TABLE public.referral_rollout_audit_events
  ADD CONSTRAINT referral_rollout_audit_events_event_scope_check
  CHECK (event_scope IN ('global', 'venue', 'partner', 'bulk'));

CREATE INDEX IF NOT EXISTS idx_referral_rollout_audit_partner_id
  ON public.referral_rollout_audit_events(partner_id)
  WHERE partner_id IS NOT NULL;
