import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';

interface ReferralSettings {
  enabled: boolean;
  globalStage: number;
  stripeEnabled: boolean;
  betaMode: boolean;
}

interface ReferralAccess {
  enabled: boolean;
  stage: number;
  hasAccess: boolean;
  isLoading: boolean;

  // Backward-compatible aliases used across existing pages.
  canAccessReferral: boolean;
  venueHasAccess: boolean;
  adminHasAccess: boolean;
  isBetaVenue: boolean;
  flags: {
    moduleEnabled: boolean;
    privateBeta: boolean;
    publicLaunch: boolean;
    stripeEnabled: boolean;
  };

  canUseNetwork: boolean;
  canUseMarketplace: boolean;
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

export function useReferralAccess(): ReferralAccess {
  const { currentVenue, isAdmin } = useVenue();

  const { data: settingsRows, isLoading: settingsLoading } = useQuery({
    queryKey: ['referral-platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['referral_system_enabled', 'referral_stage', 'referral_stripe_enabled', 'referral_beta_mode']);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: entitlementRow, isLoading: entitlementLoading } = useQuery({
    queryKey: ['venue-marketplace-entitlement', currentVenue?.id],
    enabled: !!currentVenue?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_entitlements')
        .select('marketplace_access_enabled')
        .eq('venue_id', currentVenue!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settings = useMemo<ReferralSettings>(() => {
    const map = new Map((settingsRows ?? []).map((row) => [row.key, row.value ?? '']));
    return {
      enabled: parseBool(map.get('referral_system_enabled'), false),
      globalStage: parseStage(map.get('referral_stage'), 1),
      stripeEnabled: parseBool(map.get('referral_stripe_enabled'), false),
      betaMode: parseBool(map.get('referral_beta_mode'), true),
    };
  }, [settingsRows]);

  const venueEnabled = Boolean(currentVenue?.referral_enabled);
  const venueBetaAccess = Boolean(currentVenue?.referral_beta_access);
  const stage = currentVenue?.referral_stage_override ?? settings.globalStage;

  const entitlementAllowsMarketplace = entitlementRow?.marketplace_access_enabled ?? false;
  const hasAccess = settings.enabled && venueEnabled && (!settings.betaMode || venueBetaAccess) && entitlementAllowsMarketplace;
  const canUseNetwork = hasAccess && stage >= 2;
  const canUseMarketplace = hasAccess && stage >= 3;

  return {
    enabled: settings.enabled,
    stage,
    hasAccess,
    isLoading: settingsLoading || entitlementLoading,

    canAccessReferral: hasAccess,
    venueHasAccess: hasAccess,
    adminHasAccess: settings.enabled && isAdmin,
    isBetaVenue: hasAccess && settings.betaMode && venueBetaAccess,
    flags: {
      moduleEnabled: settings.enabled,
      privateBeta: settings.enabled && settings.betaMode,
      publicLaunch: settings.enabled && stage >= 3,
      stripeEnabled: settings.stripeEnabled,
    },

    canUseNetwork,
    canUseMarketplace,
  };
}
