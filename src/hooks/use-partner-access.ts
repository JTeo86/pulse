import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface PartnerAccess {
  isLoading: boolean;
  hasAccess: boolean;
  isBeta: boolean;
  referrer: {
    id: string;
    full_name: string;
    email: string;
    instagram_handle: string | null;
    role_type: string;
    status: string;
    venue_id: string | null;
  } | null;
  flags: {
    moduleEnabled: boolean;
    privateBeta: boolean;
    publicLaunch: boolean;
  };
}

export function usePartnerAccess(): PartnerAccess {
  const { user } = useAuth();

  const { data: flagRows, isLoading: flagsLoading } = useQuery({
    queryKey: ['partner-referral-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('flag_key, is_enabled')
        .is('venue_id', null)
        .in('flag_key', [
          'feature.referral_network_enabled',
          'feature.referral_network_private_beta',
          'feature.referral_network_public_launch',
        ]);
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
        .select('id, full_name, email, instagram_handle, role_type, status, venue_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.email,
    staleTime: 1000 * 60 * 5,
  });

  const { data: betaAccess, isLoading: betaLoading } = useQuery({
    queryKey: ['partner-beta-access', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data, error } = await supabase
        .from('referral_beta_access')
        .select('status')
        .eq('email', user.email)
        .eq('access_type', 'referrer')
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.email,
    staleTime: 1000 * 60 * 5,
  });

  const getFlag = (key: string) =>
    flagRows?.find((f) => f.flag_key === key)?.is_enabled ?? false;

  const flags = {
    moduleEnabled: getFlag('feature.referral_network_enabled'),
    privateBeta: getFlag('feature.referral_network_private_beta'),
    publicLaunch: getFlag('feature.referral_network_public_launch'),
  };

  const isBeta = !!betaAccess;
  const isActiveReferrer = !!referrer;

  let hasAccess = false;
  if (flags.moduleEnabled && isActiveReferrer) {
    if (flags.publicLaunch) {
      hasAccess = true;
    } else if (flags.privateBeta && isBeta) {
      hasAccess = true;
    }
  }

  return {
    isLoading: flagsLoading || referrerLoading || betaLoading,
    hasAccess,
    isBeta,
    referrer,
    flags,
  };
}
