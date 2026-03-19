import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useVenue } from '@/lib/venue-context';

export interface PlanPublishItem {
  id: string;
  plan_id: string;
  plan_asset_id: string | null;
  content_asset_id: string | null;
  channel: string;
  pack_type: string;
  title: string;
  caption: string;
  publish_date: string | null;
  reminder_at: string | null;
  posted_at: string | null;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const PUBLISH_CHANNELS = [
  { value: 'instagram_feed', label: 'Instagram Feed', icon: 'image', category: 'social' },
  { value: 'instagram_stories', label: 'Instagram Stories', icon: 'play', category: 'social' },
  { value: 'instagram_reels', label: 'Instagram Reels', icon: 'video', category: 'social' },
  { value: 'tiktok', label: 'TikTok', icon: 'video', category: 'social' },
  { value: 'email', label: 'Email', icon: 'mail', category: 'direct' },
  { value: 'sms', label: 'SMS / Push Notification', icon: 'message', category: 'direct' },
] as const;

export type PublishChannel = typeof PUBLISH_CHANNELS[number]['value'];

export const PACK_STATUSES = ['draft', 'ready', 'scheduled', 'reminded', 'sent_to_calendar', 'published', 'archived'] as const;
export type PackStatus = typeof PACK_STATUSES[number];

export const PACK_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  ready: { label: 'Ready', color: 'bg-info/10 text-info' },
  scheduled: { label: 'Scheduled', color: 'bg-accent/10 text-accent' },
  reminded: { label: 'Reminder Sent', color: 'bg-warning/10 text-warning' },
  sent_to_calendar: { label: 'In Calendar', color: 'bg-success/10 text-success' },
  published: { label: 'Posted', color: 'bg-success/10 text-success' },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground' },
};

/** Channel-to-preferred-copy-type mapping */
export const CHANNEL_COPY_MAP: Record<string, string[]> = {
  instagram_feed: ['instagram_caption', 'short_caption'],
  instagram_stories: ['story_text', 'instagram_caption'],
  instagram_reels: ['reel_hook', 'instagram_caption'],
  tiktok: ['reel_hook', 'short_caption', 'instagram_caption'],
  email: ['email_subject', 'email_body'],
  sms: ['sms_push_notification'],
};

/** Channel-to-preferred-asset-type mapping */
export const CHANNEL_ASSET_MAP: Record<string, string[]> = {
  instagram_feed: ['image', 'photo'],
  instagram_stories: ['image', 'photo'],
  instagram_reels: ['reel', 'video'],
  tiktok: ['reel', 'video'],
  email: ['image', 'photo'],
  sms: [],
};

/** Map pack status → calendar item status */
function packStatusToCalendarStatus(packStatus: string): string {
  switch (packStatus) {
    case 'scheduled':
    case 'reminded':
    case 'sent_to_calendar':
      return 'scheduled';
    case 'published':
      return 'published';
    default:
      return 'draft';
  }
}

export function usePlanPublish(planId: string | undefined) {
  const { toast } = useToast();
  const { currentVenue } = useVenue();
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

  /** Create or update the linked content_items calendar record */
  const syncCalendarItem = useCallback(async (
    packItem: PlanPublishItem,
    resolvedAssetUrl?: string | null,
    planTitle?: string,
  ) => {
    if (!currentVenue) return;
    const calendarItemId = (packItem.metadata as any)?.calendar_item_id;
    const calendarStatus = packStatusToCalendarStatus(packItem.status);

    const payload: Record<string, any> = {
      venue_id: currentVenue.id,
      caption_final: packItem.caption || null,
      media_master_url: resolvedAssetUrl || null,
      scheduled_for: packItem.publish_date || null,
      status: calendarStatus,
      intent: packItem.channel,
      source_plan_publish_item_id: packItem.id,
      source_plan_title: planTitle || (packItem.metadata as any)?.plan_title || null,
    };

    if (calendarItemId) {
      // Update existing calendar item
      await supabase
        .from('content_items')
        .update(payload as any)
        .eq('id', calendarItemId);
    } else {
      // Create new calendar item
      const { data, error } = await supabase
        .from('content_items')
        .insert(payload as any)
        .select('id')
        .single();

      if (!error && data) {
        // Store calendar_item_id back on the pack
        const newMeta = { ...(packItem.metadata || {}), calendar_item_id: data.id, plan_title: planTitle };
        await supabase
          .from('plan_publish_items')
          .update({ metadata: newMeta } as any)
          .eq('id', packItem.id);
        // Update local state
        setItems(prev => prev.map(i =>
          i.id === packItem.id ? { ...i, metadata: newMeta } : i
        ));
      }
    }
  }, [currentVenue]);

  const addPublishItem = useCallback(async (params: {
    content_asset_id?: string;
    plan_asset_id?: string;
    channel: string;
    pack_type?: string;
    title?: string;
    caption?: string;
    publish_date?: string;
    reminder_at?: string;
    status?: string;
    metadata?: Record<string, any>;
  }, resolvedAssetUrl?: string | null, planTitle?: string) => {
    if (!planId) return;
    const { data, error } = await supabase
      .from('plan_publish_items')
      .insert({
        plan_id: planId,
        content_asset_id: params.content_asset_id || null,
        plan_asset_id: params.plan_asset_id || null,
        channel: params.channel,
        pack_type: params.pack_type || 'social',
        title: params.title || '',
        caption: params.caption || '',
        publish_date: params.publish_date || null,
        reminder_at: params.reminder_at || null,
        status: params.status || 'ready',
        metadata: params.metadata || {},
      } as any)
      .select()
      .single();
    if (error) {
      toast({ variant: 'destructive', title: 'Error creating post pack', description: error.message });
    } else if (data) {
      const packItem = data as PlanPublishItem;
      setItems(prev => [...prev, packItem]);
      // Auto-create linked calendar item
      await syncCalendarItem(packItem, resolvedAssetUrl, planTitle);
      toast({ title: 'Post pack created & added to calendar' });
    }
    return data as PlanPublishItem | undefined;
  }, [planId, toast, syncCalendarItem]);

  const updatePublishItem = useCallback(async (
    itemId: string,
    updates: Partial<PlanPublishItem>,
    resolvedAssetUrl?: string | null,
    planTitle?: string,
  ) => {
    const updatedItem = items.find(i => i.id === itemId);
    const merged = updatedItem ? { ...updatedItem, ...updates } : null;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
    const { error } = await supabase
      .from('plan_publish_items')
      .update(updates as any)
      .eq('id', itemId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error updating', description: error.message });
      fetchItems();
    } else if (merged) {
      // Sync calendar item
      await syncCalendarItem(merged as PlanPublishItem, resolvedAssetUrl, planTitle);
    }
  }, [fetchItems, toast, items, syncCalendarItem]);

  const removePublishItem = useCallback(async (itemId: string) => {
    // Also remove linked calendar item
    const item = items.find(i => i.id === itemId);
    const calendarItemId = (item?.metadata as any)?.calendar_item_id;

    setItems(prev => prev.filter(i => i.id !== itemId));
    const { error } = await supabase
      .from('plan_publish_items')
      .delete()
      .eq('id', itemId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error removing', description: error.message });
      fetchItems();
    }

    // Clean up calendar item
    if (calendarItemId) {
      await supabase.from('content_items').delete().eq('id', calendarItemId);
    }
  }, [fetchItems, toast, items]);

  const markAsPosted = useCallback(async (itemId: string, resolvedAssetUrl?: string | null, planTitle?: string) => {
    const now = new Date().toISOString();
    await updatePublishItem(itemId, {
      status: 'published',
      posted_at: now,
    } as any, resolvedAssetUrl, planTitle);
    toast({ title: 'Marked as posted ✓' });
  }, [updatePublishItem, toast]);

  const archivePack = useCallback(async (itemId: string) => {
    // Archive the calendar item too
    const item = items.find(i => i.id === itemId);
    const calendarItemId = (item?.metadata as any)?.calendar_item_id;

    await updatePublishItem(itemId, { status: 'archived' } as any);

    if (calendarItemId) {
      await supabase.from('content_items').delete().eq('id', calendarItemId);
    }
  }, [updatePublishItem, items]);

  // Grouped by status
  const readyPacks = items.filter(i => i.status === 'draft' || i.status === 'ready');
  const scheduledPacks = items.filter(i => i.status === 'scheduled' || i.status === 'reminded' || i.status === 'sent_to_calendar');
  const completedPacks = items.filter(i => i.status === 'published' || i.status === 'archived');

  return {
    items,
    loading,
    readyPacks,
    scheduledPacks,
    completedPacks,
    fetchItems,
    addPublishItem,
    updatePublishItem,
    removePublishItem,
    markAsPosted,
    archivePack,
  };
}
