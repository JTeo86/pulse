import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface PartnerProfile {
  id: string;
  full_name: string;
  email: string;
  instagram_handle: string | null;
  role_type: string;
  status: string;
  venue_id: string | null;
  partner_referral_enabled: boolean;
  partner_beta_access: boolean;
  partner_stage_override: number | null;
  partner_rollout_changed_at: string | null;
  partner_rollout_changed_by: string | null;
  referral_code: string;
  referral_slug: string;
  referral_active: boolean;
}

interface PartnerReferralAccess {
  isLoading: boolean;
  enabled: boolean;
  hasAccess: boolean;
  stage: number;
  canViewInvites: boolean;
  canViewMultipleVenues: boolean;
  canBrowseMarketplace: boolean;
  referrer: PartnerProfile | null;
}

function parseBool(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return value.toLowerCase() === 'true';
}

function parseStage(value: string | undefined, fallback = 1) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(3, Math.trunc(parsed)));
}

export function usePartnerReferralAccess(): PartnerReferralAccess {
  const { user } = useAuth();

  const { data: settingsRows, isLoading: settingsLoading } = useQuery({
    queryKey: ['partner-referral-platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['referral_system_enabled', 'referral_stage', 'referral_beta_mode']);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: referrer, isLoading: referrerLoading } = useQuery({
    queryKey: ['partner-referrer-profile', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;

      const { data, error } = await supabase
        .from('referrers')
        .select('id, full_name, email, instagram_handle, role_type, status, venue_id, partner_referral_enabled, partner_beta_access, partner_stage_override, partner_rollout_changed_at, partner_rollout_changed_by, referral_code, referral_slug, referral_active')
        .eq('email', user.email)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        partner_referral_enabled: data.partner_referral_enabled ?? false,
        partner_beta_access: data.partner_beta_access ?? false,
        partner_stage_override: data.partner_stage_override ?? null,
        partner_rollout_changed_at: data.partner_rollout_changed_at ?? null,
        partner_rollout_changed_by: data.partner_rollout_changed_by ?? null,
        referral_code: data.referral_code,
        referral_slug: data.referral_slug,
        referral_active: data.referral_active ?? true,
      };
    },
    enabled: !!user?.email,
    staleTime: 1000 * 60 * 5,
  });

  const platform = useMemo(() => {
    const map = new Map((settingsRows ?? []).map((row) => [row.key, row.value ?? '']));
    return {
      enabled: parseBool(map.get('referral_system_enabled'), false),
      stage: parseStage(map.get('referral_stage'), 1),
      betaMode: parseBool(map.get('referral_beta_mode'), true),
    };
  }, [settingsRows]);

  const enabled = platform.enabled;
  const stage = referrer?.partner_stage_override ?? platform.stage;
  const hasAccess = Boolean(
    enabled &&
    referrer &&
    referrer.partner_referral_enabled &&
    (!platform.betaMode || referrer.partner_beta_access)
  );

  return {
    isLoading: settingsLoading || referrerLoading,
    enabled,
    hasAccess,
    stage,
    canViewInvites: hasAccess && stage >= 2,
    canViewMultipleVenues: hasAccess && stage >= 2,
    canBrowseMarketplace: hasAccess && stage >= 3,
    referrer,
  };
}

// Backwards-compatible alias for existing imports.
export const usePartnerAccess = usePartnerReferralAccess;
