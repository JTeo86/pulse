import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';

export interface ContentAsset {
  id: string;
  venue_id: string;
  created_by: string | null;
  asset_type: 'image' | 'video';
  source_type: 'upload' | 'generated_image' | 'generated_video' | 'approved_output' | 'variation' | 'reel_source';
  status: 'draft' | 'approved' | 'archived' | 'scheduled' | 'published' | 'failed';
  title: string | null;
  prompt_snapshot: Record<string, unknown> | null;
  generation_settings: Record<string, unknown> | null;
  storage_path: string | null;
  public_url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  parent_asset_id: string | null;
  root_asset_id: string | null;
  source_job_id: string | null;
  derived_from_editor_job_id: string | null;
  lineage_depth: number;
  is_favorite: boolean;
  is_style_reference: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // resolved URL for display
  _resolvedUrl?: string;
}

export function useContentAssets(assetType?: 'image' | 'video') {
  const { currentVenue } = useVenue();
  const venueId = currentVenue?.id;

  return useQuery({
    queryKey: ['content-assets', venueId, assetType],
    queryFn: async () => {
      if (!venueId) return [];
      let query = supabase
        .from('content_assets')
        .select('*')
        .eq('venue_id', venueId)
        .neq('status', 'failed')
        .order('created_at', { ascending: false });

      if (assetType) {
        query = query.eq('asset_type', assetType);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Resolve signed URLs for assets with storage_path
      const assets = (data || []) as ContentAsset[];
      const resolved = await Promise.all(
        assets.map(async (asset) => {
          if (asset.public_url) {
            return { ...asset, _resolvedUrl: asset.public_url };
          }
          if (asset.storage_path) {
            const { data: signed } = await supabase.storage
              .from('venue-assets')
              .createSignedUrl(asset.storage_path, 3600);
            return { ...asset, _resolvedUrl: signed?.signedUrl || '' };
          }
          return { ...asset, _resolvedUrl: '' };
        })
      );
      return resolved;
    },
    enabled: !!venueId,
    staleTime: 1000 * 30,
  });
}

export function useAssetLineage(assetId: string | null) {
  const { currentVenue } = useVenue();
  const venueId = currentVenue?.id;

  return useQuery({
    queryKey: ['asset-lineage', assetId, venueId],
    queryFn: async () => {
      if (!assetId || !venueId) return [];

      // Get the asset to find root
      const { data: asset } = await supabase
        .from('content_assets')
        .select('root_asset_id')
        .eq('id', assetId)
        .single();

      const rootId = asset?.root_asset_id || assetId;

      // Get all assets in this lineage chain
      const { data, error } = await supabase
        .from('content_assets')
        .select('*')
        .eq('venue_id', venueId)
        .or(`id.eq.${rootId},root_asset_id.eq.${rootId}`)
        .order('lineage_depth', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const assets = (data || []) as ContentAsset[];
      return Promise.all(
        assets.map(async (a) => {
          if (a.public_url) return { ...a, _resolvedUrl: a.public_url };
          if (a.storage_path) {
            const { data: signed } = await supabase.storage
              .from('venue-assets')
              .createSignedUrl(a.storage_path, 3600);
            return { ...a, _resolvedUrl: signed?.signedUrl || '' };
          }
          return { ...a, _resolvedUrl: '' };
        })
      );
    },
    enabled: !!assetId && !!venueId,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, isFavorite }: { assetId: string; isFavorite: boolean }) => {
      const { error } = await supabase
        .from('content_assets')
        .update({ is_favorite: isFavorite })
        .eq('id', assetId);
      if (error) throw error;
    },
    onSuccess: (_, { isFavorite }) => {
      queryClient.invalidateQueries({ queryKey: ['content-assets'] });
      toast({ title: isFavorite ? 'Marked as favorite' : 'Removed from favorites' });
    },
  });
}

export function useUpdateAssetStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ assetId, status }: { assetId: string; status: string }) => {
      const { error } = await supabase
        .from('content_assets')
        .update({ status })
        .eq('id', assetId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['content-assets'] });
      toast({ title: `Asset ${status}` });
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (asset: ContentAsset) => {
      if (asset.storage_path) {
        await supabase.storage.from('venue-assets').remove([asset.storage_path]);
      }
      const { error } = await supabase.from('content_assets').delete().eq('id', asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-assets'] });
      toast({ title: 'Asset deleted' });
    },
    onError: () => {
      toast({ title: 'Failed to delete asset', variant: 'destructive' });
    },
  });
}

export function useCreateVariation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      parent_asset_id: string;
      venue_id: string;
      variation_mode?: string;
      notes?: string;
      realism_mode_override?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-image-variation', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-assets'] });
      toast({ title: 'Variation created', description: 'Your new image variation is ready.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Variation failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useCreateReel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      source_asset_id: string;
      venue_id: string;
      reel_style?: string;
      aspect_ratio?: string;
      motion_preset?: string;
      duration_seconds?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-reel-from-image', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['content-assets'] });
      if (!data?.provider_configured) {
        toast({
          title: 'Reel job queued',
          description: 'Video provider not yet configured. Configure in Platform Admin to process.',
        });
      } else {
        toast({ title: 'Reel queued', description: 'Your reel is being generated.' });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Reel creation failed', description: err.message, variant: 'destructive' });
    },
  });
}
