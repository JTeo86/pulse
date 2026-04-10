import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface PartnerAccess {
  isLoading: boolean;
  hasAccess: boolean;
  referrer: {
    id: string;
    full_name: string;
    email: string;
    instagram_handle: string | null;
    role_type: string;
    status: string;
    venue_id: string | null;
    venue_referral_enabled: boolean;
    venue_referral_stage_override: number | null;
  } | null;
  stage: number;
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

export function usePartnerAccess(): PartnerAccess {
  const { user } = useAuth();

  const { data: settingsRows, isLoading: settingsLoading } = useQuery({
    queryKey: ['partner-referral-platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['referral_system_enabled', 'referral_stage']);
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
      if (!data?.venue_id) return null;

      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .select('referral_enabled, referral_stage_override')
        .eq('id', data.venue_id)
        .maybeSingle();

      if (venueError) throw venueError;

      return {
        ...data,
        venue_referral_enabled: venue?.referral_enabled ?? false,
        venue_referral_stage_override: venue?.referral_stage_override ?? null,
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
    };
  }, [settingsRows]);

  const stage = referrer?.venue_referral_stage_override ?? platform.stage;
  const hasAccess = Boolean(
    platform.enabled &&
    referrer &&
    referrer.venue_referral_enabled &&
    stage >= 2
  );

  return {
    isLoading: settingsLoading || referrerLoading,
    hasAccess,
    referrer,
    stage,
  };
}
