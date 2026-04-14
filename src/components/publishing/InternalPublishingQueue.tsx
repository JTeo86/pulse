import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, ImageOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MediaImage } from '@/components/ui/media-image';
import { StatusBadge } from '@/components/ui/status-badge';

interface ContentItem {
  id: string;
  caption_final: string | null;
  media_master_url: string | null;
  media_variants: unknown;
  status: 'approved' | 'ready' | 'queued' | 'scheduled' | 'published' | 'failed' | null;
  scheduled_for: string | null;
  created_at: string;
}

interface BufferChannel {
  id: string;
  service: string;
  service_username: string;
  formatted_username: string;
}

const approvedStatuses = ['approved', 'ready'];

function resolveImage(item: ContentItem) {
  if (item.media_master_url) return item.media_master_url;
  if (!item.media_variants || typeof item.media_variants !== 'object') return null;

  const queue: unknown[] = [item.media_variants];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === 'string' && current.startsWith('http')) return current;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === 'object') queue.push(...Object.values(current as Record<string, unknown>));
  }

  return null;
}

function getErrorMessage(error: any) {
  return error?.context?.error?.message || error?.message || 'Unknown error';
}

export function InternalPublishingQueue() {
  const { currentVenue, isOwner, currentMember } = useVenue();
  const { toast } = useToast();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [channels, setChannels] = useState<BufferChannel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [bufferConnected, setBufferConnected] = useState(false);

  const role = (currentMember?.role || '').toLowerCase();
  const canPublish = isOwner || role === 'admin' || role === 'venue_admin';

  const fetchItems = async () => {
    if (!currentVenue) return;
    const { data, error } = await supabase
      .from('content_items')
      .select('id, caption_final, media_master_url, media_variants, status, scheduled_for, created_at')
      .eq('venue_id', currentVenue.id)
      .in('status', approvedStatuses)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setItems((data ?? []) as ContentItem[]);
  };

  const fetchBufferChannels = async () => {
    if (!currentVenue) return;

    const { data, error } = await supabase.functions.invoke(`buffer-oauth?action=channels&venue_id=${currentVenue.id}`);
    if (error) throw error;

    const connected = Boolean(data?.connected);
    const list = (Array.isArray(data?.channels) ? data.channels : []) as BufferChannel[];

    setBufferConnected(connected);
    setChannels(list);
    if (list.length > 0 && selectedChannels.size === 0) {
      setSelectedChannels(new Set([list[0].id]));
    }
  };

  useEffect(() => {
    if (!currentVenue) return;
    setLoading(true);

    Promise.all([fetchItems(), fetchBufferChannels()])
      .catch((error: any) => {
        toast({ title: 'Failed to load publishing data', description: getErrorMessage(error), variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [currentVenue?.id]);

  const selectedCount = selectedIds.size;

  const canSend = useMemo(() => (
    canPublish && !sending && selectedIds.size > 0 && selectedChannels.size > 0 && bufferConnected
  ), [canPublish, sending, selectedIds.size, selectedChannels.size, bufferConnected]);

  const toggleSelectItem = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectChannel = (id: string, checked: boolean) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const sendToBuffer = async () => {
    if (!currentVenue || !canSend) return;
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-to-buffer', {
        body: {
          venue_id: currentVenue.id,
          content_ids: Array.from(selectedIds),
          profile_ids: Array.from(selectedChannels),
        },
      });

      if (error) throw error;

      const sent = Number(data?.sent ?? 0);
      const failed = Number(data?.failed ?? 0);

      if (sent > 0) {
        toast({ title: `Sent to Buffer (${sent})` });
      }
      if (failed > 0) {
        toast({ title: `${failed} items failed`, description: 'Review content details and schedule time, then retry.', variant: 'destructive' });
      }

      setSelectedIds(new Set());
      await fetchItems();
    } catch (error: any) {
      toast({ title: 'Failed to send to Buffer', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const refreshBufferStatus = async () => {
    if (!currentVenue || !canPublish) return;
    setRefreshingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-buffer-status', {
        body: { venue_id: currentVenue.id },
      });

      if (error) throw error;
      toast({ title: 'Buffer status refreshed', description: `${data?.synced ?? 0} items synced.` });
    } catch (error: any) {
      toast({ title: 'Failed to refresh Buffer status', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setRefreshingStatus(false);
    }
  };

  if (loading) {
    return <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="card-elevated p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium">Buffer channels</h3>
            <p className="text-sm text-muted-foreground">Select one or more channels for this send.</p>
          </div>
          <Badge variant={bufferConnected ? 'default' : 'secondary'}>{bufferConnected ? 'Connected' : 'Not connected'}</Badge>
        </div>

        {!bufferConnected ? (
          <p className="text-sm text-muted-foreground">Connect Buffer in Integrations first.</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">Connected, but no Buffer channels were returned for this account.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {channels.map((channel) => (
              <label key={channel.id} className="flex items-center gap-2 rounded border p-2 cursor-pointer">
                <Checkbox
                  checked={selectedChannels.has(channel.id)}
                  onCheckedChange={(checked) => toggleSelectChannel(channel.id, Boolean(checked))}
                />
                <span className="text-sm">{channel.service} • {channel.formatted_username || channel.service_username}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card-elevated p-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{selectedCount} selected</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshBufferStatus} disabled={!canPublish || refreshingStatus || !bufferConnected}>
            {refreshingStatus ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh Buffer status
          </Button>
          <Button onClick={sendToBuffer} disabled={!canSend}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send to Buffer
          </Button>
        </div>
      </div>

      {!canPublish && (
        <p className="text-sm text-muted-foreground">Only venue owner/admin can publish or refresh statuses.</p>
      )}

      {items.length === 0 ? (
        <EmptyState icon={Send} title="No approved content" description="Approve content first, then it will appear here for Buffer publishing." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const image = resolveImage(item);
            return (
              <div key={item.id} className="card-elevated p-3 flex gap-3 items-start">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  disabled={!canPublish}
                  onCheckedChange={(checked) => toggleSelectItem(item.id, Boolean(checked))}
                />
                <div className="w-20 h-20 rounded bg-muted overflow-hidden shrink-0">
                  {image ? (
                    <MediaImage src={image} alt="" aspectClassName="w-full h-full" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageOff className="w-4 h-4" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm line-clamp-3">{item.caption_final || 'No caption (text-only post can still be sent if you add a caption first).'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.status && <StatusBadge status={item.status} />}
                    <p className="text-xs text-muted-foreground">Created {new Date(item.created_at).toLocaleString()}</p>
                    {item.scheduled_for ? <p className="text-xs text-muted-foreground">Scheduled for {new Date(item.scheduled_for).toLocaleString()}</p> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
