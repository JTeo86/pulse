import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProductPhase = 'phase_1' | 'phase_2';

export interface PhaseFlags {
  product_phase: ProductPhase;
  copywriter_enabled: boolean;
  image_editor_enabled: boolean;
  video_enabled: boolean;
  kling_enabled: boolean;
  isLoading: boolean;
}

interface FlagRow {
  flag_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
}

const DEFAULTS: Omit<PhaseFlags, 'isLoading'> = {
  product_phase: 'phase_1',
  copywriter_enabled: true,
  image_editor_enabled: true,
  video_enabled: false,
  kling_enabled: false,
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
          'feature.copywriter_enabled',
          'feature.image_editor_enabled',
          'feature.video_enabled',
          'feature.kling_enabled',
        ]);
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  if (!data || isLoading) {
    return { ...DEFAULTS, isLoading: true };
  }

  const get = (key: string) => data.find((f) => f.flag_key === key);

  const phaseRow = get('product_phase');
  const product_phase =
    ((phaseRow?.config_json as { value?: string })?.value as ProductPhase) ?? 'phase_1';

  // Phase 1 always hard-gates video regardless of flags
  const isPhase2 = product_phase === 'phase_2';

  return {
    product_phase,
    copywriter_enabled: get('feature.copywriter_enabled')?.is_enabled ?? true,
    image_editor_enabled: get('feature.image_editor_enabled')?.is_enabled ?? true,
    video_enabled: isPhase2 && (get('feature.video_enabled')?.is_enabled ?? false),
    kling_enabled:
      isPhase2 &&
      (get('feature.video_enabled')?.is_enabled ?? false) &&
      (get('feature.kling_enabled')?.is_enabled ?? false),
    isLoading: false,
  };
}
