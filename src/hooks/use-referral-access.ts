import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';

interface ReferralFlags {
  moduleEnabled: boolean;
  privateBeta: boolean;
  publicLaunch: boolean;
  stripeEnabled: boolean;
}

interface ReferralAccess {
  flags: ReferralFlags;
  venueHasAccess: boolean;
  adminHasAccess: boolean;
  canAccessReferral: boolean;
  isBetaVenue: boolean;
  isLoading: boolean;
}

export function useReferralAccess(): ReferralAccess {
  const { currentVenue, isAdmin } = useVenue();

  const { data: flagRows, isLoading: flagsLoading } = useQuery({
    queryKey: ['referral-flags'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_safe_feature_flags');
      if (error) throw error;
      return (data ?? []) as { flag_key: string; is_enabled: boolean }[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: betaAccess, isLoading: betaLoading } = useQuery({
    queryKey: ['referral-beta-access', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const { data, error } = await supabase
        .from('referral_beta_access')
        .select('status')
        .eq('venue_id', currentVenue.id)
        .eq('access_type', 'venue')
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentVenue,
    staleTime: 1000 * 60 * 5,
  });

  const getFlag = (key: string) =>
    flagRows?.find((f) => f.flag_key === key)?.is_enabled ?? false;

  const flags: ReferralFlags = {
    moduleEnabled: getFlag('feature.referral_network_enabled'),
    privateBeta: getFlag('feature.referral_network_private_beta'),
    publicLaunch: getFlag('feature.referral_network_public_launch'),
    stripeEnabled: getFlag('feature.referral_network_stripe_enabled'),
  };

  const isBetaVenue = !!betaAccess;

  let venueHasAccess = false;
  if (flags.moduleEnabled) {
    if (flags.publicLaunch) {
      venueHasAccess = true;
    } else if (flags.privateBeta && isBetaVenue) {
      venueHasAccess = true;
    }
  }

  const adminHasAccess = flags.moduleEnabled && isAdmin;
  const canAccessReferral = venueHasAccess || adminHasAccess;

  return {
    flags,
    venueHasAccess,
    adminHasAccess,
    canAccessReferral,
    isBetaVenue,
    isLoading: flagsLoading || betaLoading,
  };
}
