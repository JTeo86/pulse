import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProductPhase = 'phase_1' | 'phase_2';

export interface PhaseFlags {
  product_phase: ProductPhase;
  video_enabled: boolean;
  isLoading: boolean;
}

interface FlagRow {
  flag_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
}

const DEFAULTS: Omit<PhaseFlags, 'isLoading'> = {
  product_phase: 'phase_1',
  video_enabled: false,
};

export function usePhaseFlags(): PhaseFlags {
  const { data, isLoading } = useQuery({
    queryKey: ['phase-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('flag_key, is_enabled, config_json')
        .is('venue_id', null)
        .in('flag_key', [
          'product_phase',
          'feature.video_enabled',
        ]);
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
    staleTime: 1000 * 60 * 5,
  });

  if (!data || isLoading) {
    return { ...DEFAULTS, isLoading: true };
  }

  const get = (key: string) => data.find((f) => f.flag_key === key);

  const phaseRow = get('product_phase');
  const product_phase =
    ((phaseRow?.config_json as { value?: string })?.value as ProductPhase) ?? 'phase_1';

  const isPhase2 = product_phase === 'phase_2';

  return {
    product_phase,
    video_enabled: isPhase2 && (get('feature.video_enabled')?.is_enabled ?? false),
    isLoading: false,
  };
}
