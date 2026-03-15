import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PlanPublishItem {
  id: string;
  plan_id: string;
  plan_asset_id: string | null;
  content_asset_id: string | null;
  channel: string;
  caption: string;
  publish_date: string | null;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const PUBLISH_CHANNELS = [
  { value: 'instagram_feed', label: 'Instagram Feed' },
  { value: 'instagram_stories', label: 'Instagram Stories' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
] as const;

export function usePlanPublish(planId: string | undefined) {
  const { toast } = useToast();
  const [items, setItems] = useState<PlanPublishItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!planId) return;
    const { data, error } = await supabase
      .from('plan_publish_items')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at');
    if (!error && data) setItems(data as PlanPublishItem[]);
    setLoading(false);
  }, [planId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addPublishItem = useCallback(async (params: {
    content_asset_id?: string;
    plan_asset_id?: string;
    channel: string;
    caption?: string;
    publish_date?: string;
  }) => {
    if (!planId) return;
    const { data, error } = await supabase
      .from('plan_publish_items')
      .insert({
        plan_id: planId,
        content_asset_id: params.content_asset_id || null,
        plan_asset_id: params.plan_asset_id || null,
        channel: params.channel,
        caption: params.caption || '',
        publish_date: params.publish_date || null,
        status: 'draft',
      })
      .select()
      .single();
    if (error) {
      toast({ variant: 'destructive', title: 'Error adding publish item', description: error.message });
    } else if (data) {
      setItems(prev => [...prev, data as PlanPublishItem]);
      toast({ title: 'Added to publish queue' });
    }
  }, [planId, toast]);

  const updatePublishItem = useCallback(async (itemId: string, updates: Partial<Pick<PlanPublishItem, 'channel' | 'caption' | 'publish_date' | 'status'>>) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
    const { error } = await supabase
      .from('plan_publish_items')
      .update(updates)
      .eq('id', itemId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error updating', description: error.message });
      fetchItems();
    }
  }, [fetchItems, toast]);

  const removePublishItem = useCallback(async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    const { error } = await supabase
      .from('plan_publish_items')
      .delete()
      .eq('id', itemId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error removing', description: error.message });
      fetchItems();
    }
  }, [fetchItems, toast]);

  return { items, loading, fetchItems, addPublishItem, updatePublishItem, removePublishItem };
}
