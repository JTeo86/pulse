import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, ImageOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MediaImage } from '@/components/ui/media-image';

interface ContentItem {
  id: string;
  caption_final: string | null;
  media_master_url: string | null;
  media_variants: unknown;
  status: string | null;
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

export function InternalPublishingQueue() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [channels, setChannels] = useState<BufferChannel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [bufferConnected, setBufferConnected] = useState(false);

  const fetchItems = async () => {
    if (!currentVenue) return;
    const { data, error } = await supabase
      .from('content_items')
      .select('id, caption_final, media_master_url, media_variants, status, created_at')
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
    if (list.length > 0) {
      setSelectedChannels(new Set([list[0].id]));
    }
  };

  useEffect(() => {
    if (!currentVenue) return;
    setLoading(true);

    Promise.all([fetchItems(), fetchBufferChannels()])
      .catch((error: any) => {
        toast({ title: 'Failed to load publishing data', description: error.message, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [currentVenue?.id]);

  const selectedCount = selectedIds.size;

  const canSend = useMemo(() => (
    !sending && selectedIds.size > 0 && selectedChannels.size > 0 && bufferConnected
  ), [sending, selectedIds.size, selectedChannels.size, bufferConnected]);

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
        toast({ title: `${failed} items failed`, description: 'Review captions/media and try again.', variant: 'destructive' });
      }

      setSelectedIds(new Set());
      await fetchItems();
    } catch (error: any) {
      toast({ title: 'Failed to send to Buffer', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
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
          <p className="text-sm text-muted-foreground">Connect Buffer in Setup → Integrations first.</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Buffer channels found for this account.</p>
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
        <Button onClick={sendToBuffer} disabled={!canSend}>
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send to Buffer
        </Button>
      </div>

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
                  onCheckedChange={(checked) => toggleSelectItem(item.id, Boolean(checked))}
                />
                <div className="w-20 h-20 rounded bg-muted overflow-hidden shrink-0">
                  {image ? (
                    <MediaImage src={image} alt="" aspectClassName="w-full h-full" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageOff className="w-4 h-4" /></div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm line-clamp-3">{item.caption_final || 'No caption'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Created {new Date(item.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
