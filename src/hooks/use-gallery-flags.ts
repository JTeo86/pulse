import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GalleryFlags {
  gallery_variations_enabled: boolean;
  gallery_reel_enabled: boolean;
  gallery_lineage_enabled: boolean;
  video_enabled: boolean;
  reel_creator_enabled: boolean;
  kling_provider_enabled: boolean;
  isLoading: boolean;
}

export function useGalleryFlags(): GalleryFlags {
  const { data, isLoading } = useQuery({
    queryKey: ['gallery-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('flag_key, is_enabled')
        .is('venue_id', null)
        .in('flag_key', [
          'feature.gallery_variations_enabled',
          'feature.gallery_reel_enabled',
          'feature.gallery_lineage_enabled',
          'feature.video_enabled',
          'feature.reel_creator_enabled',
          'feature.kling_provider_enabled',
        ]);
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  if (!data || isLoading) {
    return {
      gallery_variations_enabled: false,
      gallery_reel_enabled: false,
      gallery_lineage_enabled: false,
      video_enabled: false,
      reel_creator_enabled: false,
      kling_provider_enabled: false,
      isLoading: true,
    };
  }

  const get = (key: string) => data.find((f) => f.flag_key === key)?.is_enabled ?? false;

  return {
    gallery_variations_enabled: get('feature.gallery_variations_enabled'),
    gallery_reel_enabled: get('feature.gallery_reel_enabled'),
    gallery_lineage_enabled: get('feature.gallery_lineage_enabled'),
    video_enabled: get('feature.video_enabled'),
    reel_creator_enabled: get('feature.reel_creator_enabled'),
    kling_provider_enabled: get('feature.kling_provider_enabled'),
    isLoading: false,
  };
}
