import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StyleChannel, StyleAssetWithAnalysis, CHANNEL_BUCKETS } from '@/types/style-intelligence';

export function useStyleAssets(venueId: string | undefined, channel: StyleChannel) {
  const [assets, setAssets] = useState<StyleAssetWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    if (!venueId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('style_reference_assets')
        .select('*, analysis:style_analysis(*)')
        .eq('venue_id', venueId)
        .eq('channel', channel)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const bucket = CHANNEL_BUCKETS[channel];
      const enriched: StyleAssetWithAnalysis[] = (data || []).map((row: any) => {
        const thumb = row.thumbnail_path
          ? supabase.storage.from(bucket).getPublicUrl(row.thumbnail_path).data.publicUrl
          : supabase.storage.from(bucket).getPublicUrl(row.storage_path).data.publicUrl;
        const pub = supabase.storage.from(bucket).getPublicUrl(row.storage_path).data.publicUrl;
        const analysis = Array.isArray(row.analysis) ? row.analysis[0] : row.analysis;
        return {
          ...row,
          analysis: analysis || null,
          publicUrl: pub,
          thumbnailUrl: thumb,
        };
      });

      setAssets(enriched);
    } catch (err) {
      console.error('useStyleAssets error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId, channel]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  return { assets, loading, refetch: fetchAssets };
}
