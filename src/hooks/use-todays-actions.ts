import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useCallback, useEffect } from 'react';

export type DueState = 'upcoming' | 'due_soon' | 'due_now' | 'overdue';

export interface TodayAction {
  id: string;
  title: string;
  caption: string | null;
  channel: string;
  reminder_at: string;
  publish_date: string | null;
  status: string;
  content_asset_id: string | null;
  plan_id: string;
  plan_title: string | null;
  media_url: string | null;
  due_state: DueState;
  metadata: Record<string, any> | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram_feed: 'Instagram Feed',
  instagram_stories: 'Instagram Stories',
  instagram_reels: 'Instagram Reels',
  tiktok: 'TikTok',
  email: 'Email',
  sms: 'SMS / Push',
};

export function getChannelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] || channel;
}

function computeDueState(reminderAt: string): DueState {
  const now = Date.now();
  const reminderTime = new Date(reminderAt).getTime();
  const diffMs = reminderTime - now;
  const diffMin = diffMs / (1000 * 60);

  if (diffMin < -1) return 'overdue';
  if (diffMin <= 0) return 'due_now';
  if (diffMin <= 30) return 'due_soon';
  return 'upcoming';
}

const DUE_STATE_ORDER: Record<DueState, number> = {
  overdue: 0,
  due_now: 1,
  due_soon: 2,
  upcoming: 3,
};

export const DUE_STATE_CONFIG: Record<DueState, { label: string; color: string; dotColor: string }> = {
  overdue: { label: 'Overdue', color: 'bg-destructive/10 text-destructive border-destructive/20', dotColor: 'bg-destructive' },
  due_now: { label: 'Due Now', color: 'bg-warning/10 text-warning border-warning/20', dotColor: 'bg-warning' },
  due_soon: { label: 'Due Soon', color: 'bg-accent/10 text-accent border-accent/20', dotColor: 'bg-accent' },
  upcoming: { label: 'Upcoming', color: 'bg-muted text-muted-foreground border-border', dotColor: 'bg-muted-foreground' },
};

export function useTodaysActions() {
  const { currentVenue } = useVenue();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['todays-actions', currentVenue?.id],
    queryFn: async (): Promise<TodayAction[]> => {
      if (!currentVenue) return [];

      // Get today's start/end + buffer for upcoming items (next 24h)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();

      const { data, error } = await supabase
        .from('plan_publish_items')
        .select(`
          id, title, caption, channel, reminder_at, publish_date, status,
          content_asset_id, plan_id, metadata,
          venue_event_plans!plan_publish_items_plan_id_fkey ( title )
        `)
        .not('reminder_at', 'is', null)
        .not('status', 'in', '("published","archived")')
        .lte('reminder_at', tomorrow)
        .order('reminder_at', { ascending: true });

      if (error) {
        console.error('Error fetching todays actions:', error);
        return [];
      }

      if (!data?.length) return [];

      // Resolve asset URLs for items that have content_asset_id
      const assetIds = data
        .map((d: any) => d.content_asset_id)
        .filter(Boolean) as string[];

      let assetUrlMap = new Map<string, string>();
      if (assetIds.length > 0) {
        const { data: assets } = await supabase
          .from('content_assets')
          .select('id, public_url, thumbnail_url')
          .in('id', assetIds);

        for (const a of assets ?? []) {
          assetUrlMap.set(a.id, a.public_url || a.thumbnail_url || '');
        }
      }

      const actions: TodayAction[] = data.map((item: any) => {
        const planData = item.venue_event_plans;
        return {
          id: item.id,
          title: item.title || 'Untitled Post',
          caption: item.caption,
          channel: item.channel,
          reminder_at: item.reminder_at,
          publish_date: item.publish_date,
          status: item.status,
          content_asset_id: item.content_asset_id,
          plan_id: item.plan_id,
          plan_title: planData?.title || (item.metadata as any)?.plan_title || null,
          media_url: item.content_asset_id ? (assetUrlMap.get(item.content_asset_id) || null) : null,
          due_state: computeDueState(item.reminder_at),
          metadata: item.metadata as Record<string, any> | null,
        };
      });

      // Sort by urgency
      actions.sort((a, b) => DUE_STATE_ORDER[a.due_state] - DUE_STATE_ORDER[b.due_state]);

      return actions;
    },
    enabled: !!currentVenue,
    refetchInterval: 60_000, // Poll every 60s while Home is open
    refetchOnWindowFocus: true,
  });

  const markPosted = useCallback(async (packId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('plan_publish_items')
      .update({ status: 'published', posted_at: now })
      .eq('id', packId);

    // Also update linked content_items
    const { data: pack } = await supabase
      .from('plan_publish_items')
      .select('metadata')
      .eq('id', packId)
      .single();

    const calendarItemId = (pack?.metadata as any)?.calendar_item_id;
    if (calendarItemId) {
      await supabase
        .from('content_items')
        .update({ status: 'published' })
        .eq('id', calendarItemId);
    }

    queryClient.invalidateQueries({ queryKey: ['todays-actions'] });
  }, [queryClient]);

  const dueCount = (query.data ?? []).filter(
    (a) => a.due_state === 'overdue' || a.due_state === 'due_now' || a.due_state === 'due_soon'
  ).length;

  return {
    actions: query.data ?? [],
    isLoading: query.isLoading,
    dueCount,
    markPosted,
    refetch: query.refetch,
  };
}
