import { useState, useEffect, useCallback, useRef } from 'react';
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

/** Valid content_items.intent values per DB constraint */
const VALID_CALENDAR_INTENTS = ['standard', 'announcement', 'event', 'menu_update', 'seasonal'] as const;
type CalendarIntent = typeof VALID_CALENDAR_INTENTS[number];

/** Map a pack channel to a valid content_items intent */
function resolveCalendarIntent(_channel: string, metadata?: Record<string, any>): CalendarIntent {
  const hint = metadata?.calendar_intent as string | undefined;
  if (hint && (VALID_CALENDAR_INTENTS as readonly string[]).includes(hint)) {
    return hint as CalendarIntent;
  }
  return 'standard';
}

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

function shouldSyncToCalendar(packItem: Pick<PlanPublishItem, 'status'>) {
  return packItem.status !== 'archived';
}

export function usePlanPublish(planId: string | undefined) {
  const { toast } = useToast();
  const { currentVenue } = useVenue();
  const [items, setItems] = useState<PlanPublishItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Track which pack IDs are currently being synced to prevent duplicate sync calls
  const syncingRef = useRef<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    if (!planId) return;

    const { data, error } = await supabase
      .from('plan_publish_items')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at');

    if (error) {
      toast({ variant: 'destructive', title: 'Error loading post packs', description: error.message });
    } else if (data) {
      setItems(data as PlanPublishItem[]);
    }

    setLoading(false);
  }, [planId, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const resolveAssetUrl = useCallback(async (contentAssetId: string | null): Promise<string | null> => {
    if (!contentAssetId) return null;
    const { data } = await supabase
      .from('content_assets')
      .select('public_url, thumbnail_url, storage_path')
      .eq('id', contentAssetId)
      .single();
    if (!data) return null;
    const isSignedUrl = (url?: string | null) =>
      url?.includes('/object/sign/') || url?.includes('?token=');
    if (data.public_url && !isSignedUrl(data.public_url)) return data.public_url;
    if (data.thumbnail_url && !isSignedUrl(data.thumbnail_url)) return data.thumbnail_url;
    if (data.storage_path) {
      const { data: signed } = await supabase.storage.from('venue-assets').createSignedUrl(data.storage_path, 3600);
      return signed?.signedUrl || null;
    }
    return null;
  }, []);

  /**
   * Idempotent sync: creates or updates exactly ONE content_items row per pack.
   * Uses a ref-based lock to prevent concurrent duplicate syncs.
   */
  const syncCalendarItem = useCallback(async (
    packItem: PlanPublishItem,
    resolvedAssetUrl?: string | null,
    planTitle?: string,
  ) => {
    if (!currentVenue?.id || !shouldSyncToCalendar(packItem)) {
      return null;
    }

    // Prevent concurrent syncs for the same pack item
    if (syncingRef.current.has(packItem.id)) {
      return null;
    }
    syncingRef.current.add(packItem.id);

    try {
      // Auto-resolve asset URL if not provided
      let mediaUrl = resolvedAssetUrl || null;
      if (!mediaUrl && packItem.content_asset_id) {
        mediaUrl = await resolveAssetUrl(packItem.content_asset_id);
      }

      const calendarItemId = packItem.metadata?.calendar_item_id as string | undefined;
      const calendarStatus = packStatusToCalendarStatus(packItem.status);
      const payload = {
        venue_id: currentVenue.id,
        caption_final: packItem.caption || null,
        caption_draft: packItem.caption || null,
        media_master_url: mediaUrl,
        scheduled_for: packItem.publish_date || null,
        status: calendarStatus,
        intent: resolveCalendarIntent(packItem.channel, packItem.metadata as Record<string, any>),
        source_plan_publish_item_id: packItem.id,
        source_plan_title: planTitle || packItem.metadata?.plan_title || null,
      };

      // UPDATE existing linked calendar item
      if (calendarItemId) {
        const { error } = await supabase
          .from('content_items')
          .update(payload)
          .eq('id', calendarItemId);

        if (error) {
          toast({ variant: 'destructive', title: 'Content Calendar sync failed', description: error.message });
          return null;
        }
        return calendarItemId;
      }

      // GUARD: Check if a content_items row already exists for this pack (idempotency)
      const { data: existing } = await supabase
        .from('content_items')
        .select('id')
        .eq('source_plan_publish_item_id', packItem.id)
        .maybeSingle();

      if (existing) {
        // Already exists — update it and persist the link
        const { error } = await supabase
          .from('content_items')
          .update(payload)
          .eq('id', existing.id);

        if (error) {
          toast({ variant: 'destructive', title: 'Content Calendar sync failed', description: error.message });
          return null;
        }

        // Persist the link back to the pack metadata
        const newMeta = {
          ...(packItem.metadata || {}),
          calendar_item_id: existing.id,
          plan_title: planTitle || packItem.metadata?.plan_title || null,
        };
        await supabase
          .from('plan_publish_items')
          .update({ metadata: newMeta })
          .eq('id', packItem.id);

        setItems((prev) => prev.map((item) =>
          item.id === packItem.id ? { ...item, metadata: newMeta } : item
        ));

        return existing.id;
      }

      // INSERT new calendar item
      const { data, error } = await supabase
        .from('content_items')
        .insert(payload)
        .select('id')
        .single();

      if (error || !data) {
        toast({
          variant: 'destructive',
          title: 'Could not add this pack to the Content Calendar',
          description: error?.message || 'Please try again.',
        });
        return null;
      }

      // Persist the link
      const newMeta = {
        ...(packItem.metadata || {}),
        calendar_item_id: data.id,
        plan_title: planTitle || packItem.metadata?.plan_title || null,
      };

      const { error: metadataError } = await supabase
        .from('plan_publish_items')
        .update({ metadata: newMeta })
        .eq('id', packItem.id);

      if (metadataError) {
        toast({
          variant: 'destructive',
          title: 'Pack saved, but calendar link could not be stored',
          description: metadataError.message,
        });
        return data.id;
      }

      setItems((prev) => prev.map((item) => (
        item.id === packItem.id ? { ...item, metadata: newMeta } : item
      )));

      return data.id;
    } finally {
      syncingRef.current.delete(packItem.id);
    }
  }, [currentVenue?.id, toast, resolveAssetUrl]);

  const removeCalendarItemLink = useCallback(async (packItem: PlanPublishItem) => {
    const calendarItemId = packItem.metadata?.calendar_item_id as string | undefined;
    const nextMetadata = { ...(packItem.metadata || {}) };
    delete nextMetadata.calendar_item_id;

    if (calendarItemId) {
      const { error } = await supabase
        .from('content_items')
        .delete()
        .eq('id', calendarItemId);

      if (error) {
        toast({ variant: 'destructive', title: 'Error removing from calendar', description: error.message });
        return false;
      }
    }

    const { error: linkError } = await supabase
      .from('plan_publish_items')
      .update({ metadata: nextMetadata })
      .eq('id', packItem.id);

    if (linkError) {
      toast({ variant: 'destructive', title: 'Error clearing calendar link', description: linkError.message });
      return false;
    }

    setItems((prev) => prev.map((item) => (
      item.id === packItem.id ? { ...item, metadata: nextMetadata } : item
    )));

    return true;
  }, [toast]);

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
      })
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating post pack', description: error.message });
      return undefined;
    }

    const packItem = data as PlanPublishItem;
    setItems((prev) => [...prev, packItem]);
    await syncCalendarItem(packItem, resolvedAssetUrl, planTitle);
    toast({ title: 'Post pack created' });
    return packItem;
  }, [planId, syncCalendarItem, toast]);

  const updatePublishItem = useCallback(async (
    itemId: string,
    updates: Partial<PlanPublishItem>,
    resolvedAssetUrl?: string | null,
    planTitle?: string,
  ) => {
    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const merged = { ...currentItem, ...updates } as PlanPublishItem;
    setItems((prev) => prev.map((item) => item.id === itemId ? merged : item));

    const { error } = await supabase
      .from('plan_publish_items')
      .update(updates)
      .eq('id', itemId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error updating post pack', description: error.message });
      fetchItems();
      return;
    }

    if (shouldSyncToCalendar(merged)) {
      await syncCalendarItem(merged, resolvedAssetUrl, planTitle);
      return;
    }

    await removeCalendarItemLink(merged);
  }, [fetchItems, items, removeCalendarItemLink, syncCalendarItem, toast]);

  const removePublishItem = useCallback(async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    const previousItems = items;
    setItems((prev) => prev.filter((entry) => entry.id !== itemId));

    if (item.metadata?.calendar_item_id) {
      const { error: calendarError } = await supabase
        .from('content_items')
        .delete()
        .eq('id', item.metadata.calendar_item_id);

      if (calendarError) {
        toast({ variant: 'destructive', title: 'Error removing linked calendar item', description: calendarError.message });
        setItems(previousItems);
        return;
      }
    }

    const { error } = await supabase
      .from('plan_publish_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error removing post pack', description: error.message });
      setItems(previousItems);
      return;
    }

    toast({ title: 'Post pack removed' });
  }, [items, toast]);

  const markAsPosted = useCallback(async (
    itemId: string,
    resolvedAssetUrl?: string | null,
    planTitle?: string,
  ) => {
    const now = new Date().toISOString();
    await updatePublishItem(itemId, {
      status: 'published',
      posted_at: now,
    }, resolvedAssetUrl, planTitle);
    toast({ title: 'Marked as posted ✓' });
  }, [toast, updatePublishItem]);

  const archivePack = useCallback(async (itemId: string) => {
    await updatePublishItem(itemId, { status: 'archived' });
  }, [updatePublishItem]);

  // Removed the auto-sync useEffect that was causing duplicate calendar items.
  // All syncing now happens explicitly via addPublishItem / updatePublishItem.

  const readyPacks = items.filter((item) => item.status === 'draft' || item.status === 'ready');
  const scheduledPacks = items.filter((item) => item.status === 'scheduled' || item.status === 'reminded' || item.status === 'sent_to_calendar');
  const completedPacks = items.filter((item) => item.status === 'published' || item.status === 'archived');

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
