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
  isBetaVenue: boolean;
  isLoading: boolean;
}

export function useReferralAccess(): ReferralAccess {
  const { currentVenue } = useVenue();

  // Fetch referral feature flags
  const { data: flagRows, isLoading: flagsLoading } = useQuery({
    queryKey: ['referral-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('flag_key, is_enabled')
        .is('venue_id', null)
        .in('flag_key', [
          'feature.referral_network_enabled',
          'feature.referral_network_private_beta',
          'feature.referral_network_public_launch',
          'feature.referral_network_stripe_enabled',
        ]);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch beta access for current venue
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

  // Determine if this venue can access the module
  let venueHasAccess = false;
  if (flags.moduleEnabled) {
    if (flags.publicLaunch) {
      venueHasAccess = true;
    } else if (flags.privateBeta && isBetaVenue) {
      venueHasAccess = true;
    }
  }

  return {
    flags,
    venueHasAccess,
    isBetaVenue,
    isLoading: flagsLoading || betaLoading,
  };
}
