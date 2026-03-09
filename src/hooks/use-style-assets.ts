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
      // venue_atmosphere is public, others are private and need signed URLs
      const isPublicBucket = bucket === 'venue_atmosphere';
      
      const enriched: StyleAssetWithAnalysis[] = await Promise.all(
        (data || []).map(async (row: any) => {
          let pub: string;
          let thumb: string;
          
          if (isPublicBucket) {
            pub = supabase.storage.from(bucket).getPublicUrl(row.storage_path).data.publicUrl;
            thumb = row.thumbnail_path
              ? supabase.storage.from(bucket).getPublicUrl(row.thumbnail_path).data.publicUrl
              : pub;
          } else {
            // Use signed URLs for private buckets (5 min TTL)
            const { data: signedPub } = await supabase.storage.from(bucket).createSignedUrl(row.storage_path, 300);
            pub = signedPub?.signedUrl || '';
            if (row.thumbnail_path) {
              const { data: signedThumb } = await supabase.storage.from(bucket).createSignedUrl(row.thumbnail_path, 300);
              thumb = signedThumb?.signedUrl || '';
            } else {
              thumb = pub;
            }
          }
          
          const analysis = Array.isArray(row.analysis) ? row.analysis[0] : row.analysis;
          return {
            ...row,
            analysis: analysis || null,
            publicUrl: pub,
            thumbnailUrl: thumb,
          };
        })
      );

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
