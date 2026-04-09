import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, CircleDashed, Download, ExternalLink, ImageOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { buildInternalPublishingAdapter, normalizePublishingStatus, type PublishingAction } from '@/lib/publishing-adapters';

interface ContentItem {
  id: string;
  intent: string;
  caption_final: string | null;
  media_master_url: string | null;
  status: string;
  scheduled_for: string | null;
  created_at: string;
}

const queueStatuses = ['approved', 'ready', 'queued', 'sent_to_buffer', 'scheduled', 'exported', 'published', 'failed'];

async function downloadUrlToFile(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not fetch media file for export.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  }
}

function downloadTextFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export function InternalPublishingQueue() {
  const { currentVenue, isAdmin } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [scheduleValues, setScheduleValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!currentVenue) return;

    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('content_items')
          .select('*')
          .eq('venue_id', currentVenue.id)
          .in('status', queueStatuses)
          .order('created_at', { ascending: false });

        if (error) throw error;
        const nextItems = (data || []) as ContentItem[];
        setItems(nextItems);
        setScheduleValues(
          nextItems.reduce<Record<string, string>>((acc, item) => {
            if (item.scheduled_for) {
              acc[item.id] = new Date(item.scheduled_for).toISOString().slice(0, 16);
            }
            return acc;
          }, {}),
        );
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading publishing queue',
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [currentVenue, toast]);

  const applyAction = async (item: ContentItem, action: PublishingAction, meta?: Record<string, unknown>) => {
    if (!currentVenue || !user || !isAdmin) return;
    setActingOnId(item.id);

    try {
      const adapter = buildInternalPublishingAdapter(item.status);
      const transition = adapter.transition(action, {
        scheduled_for: scheduleValues[item.id] ? new Date(scheduleValues[item.id]).toISOString() : null,
      });

      const { error } = await supabase
        .from('content_items')
        .update(transition.updates)
        .eq('id', item.id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        venue_id: currentVenue.id,
        user_id: user.id,
        action: transition.auditAction,
        entity_type: 'content_item',
        entity_id: item.id,
        meta: {
          adapter_id: adapter.id,
          adapter_label: adapter.label,
          ...meta,
          ...transition.updates,
        },
      });

      setItems((prev) => prev.map((existing) => (
        existing.id === item.id ? { ...existing, ...transition.updates } : existing
      )));
      toast({ title: transition.successMessage });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Publishing queue update failed',
        description: error.message,
      });
    } finally {
      setActingOnId(null);
    }
  };

  const handleExportPack = async (item: ContentItem) => {
    const safeSlug = `${item.intent || 'content'}-${item.id.slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const caption = item.caption_final || '';
    const scheduledAt = scheduleValues[item.id] || item.scheduled_for || '';

    const exportSummary = [
      `Pulse Publish Pack`,
      `Item ID: ${item.id}`,
      `Intent: ${item.intent || 'standard'}`,
      `Status when exported: ${normalizePublishingStatus(item.status)}`,
      `Scheduled for: ${scheduledAt || 'Not scheduled'}`,
      '',
      'Caption',
      '-------',
      caption || '(No caption set)',
    ].join('\n');

    downloadTextFile(exportSummary, `${safeSlug}-caption.txt`);
    if (item.media_master_url) {
      await downloadUrlToFile(item.media_master_url, `${safeSlug}-image`);
    }

    await applyAction(item, 'mark_exported', {
      exported_at: new Date().toISOString(),
      export_files: {
        caption: `${safeSlug}-caption.txt`,
        image_included: Boolean(item.media_master_url),
      },
    });
  };

  const buckets = useMemo(() => ({
    ready: items.filter((i) => normalizePublishingStatus(i.status) === 'ready'),
    activeQueue: items.filter((i) => ['queued', 'scheduled', 'exported'].includes(normalizePublishingStatus(i.status))),
    published: items.filter((i) => normalizePublishingStatus(i.status) === 'published'),
    failed: items.filter((i) => normalizePublishingStatus(i.status) === 'failed'),
  }), [items]);

  const ContentCard = ({ item }: { item: ContentItem }) => {
    const uiStatus = normalizePublishingStatus(item.status);

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-4"
      >
        <div className="flex gap-4">
          <div className="w-24 h-24 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
            {item.media_master_url ? (
              <img src={item.media_master_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageOff className="w-5 h-5" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground capitalize">{item.intent || 'standard'}</span>
              <StatusBadge status={uiStatus} />
            </div>

            <p className="text-sm line-clamp-2">{item.caption_final || 'No caption yet'}</p>

            {item.scheduled_for && (
              <p className="text-xs text-muted-foreground">
                Scheduled: {new Date(item.scheduled_for).toLocaleString()}
              </p>
            )}

            {isAdmin && (
              <div className="space-y-2">
                {(uiStatus === 'ready' || uiStatus === 'failed') && (
                  <Button
                    size="sm"
                    onClick={() => applyAction(item, 'add_to_queue')}
                    disabled={actingOnId === item.id}
                    className="btn-primary-editorial"
                  >
                    {actingOnId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add to Queue'}
                  </Button>
                )}

                {uiStatus !== 'published' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      value={scheduleValues[item.id] || ''}
                      onChange={(event) => setScheduleValues((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      className="h-9 rounded-md border bg-background px-2 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyAction(item, 'set_scheduled_time')}
                      disabled={actingOnId === item.id || !scheduleValues[item.id]}
                    >
                      Set Scheduled Time
                    </Button>
                  </div>
                )}

                {uiStatus !== 'published' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportPack(item)}
                      disabled={actingOnId === item.id}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Export Publish Pack
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => applyAction(item, 'mark_published')}
                      disabled={actingOnId === item.id}
                    >
                      Mark Published
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="ready" className="space-y-6">
      <TabsList className="bg-muted/50">
        <TabsTrigger value="ready" className="gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Ready ({buckets.ready.length})
        </TabsTrigger>
        <TabsTrigger value="queue" className="gap-2">
          <CircleDashed className="w-4 h-4" />
          Queue ({buckets.activeQueue.length})
        </TabsTrigger>
        <TabsTrigger value="published" className="gap-2">
          <ExternalLink className="w-4 h-4" />
          Published ({buckets.published.length})
        </TabsTrigger>
        <TabsTrigger value="failed" className="gap-2">
          <CalendarClock className="w-4 h-4" />
          Failed ({buckets.failed.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ready">
        {buckets.ready.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No items ready"
            description="Approve drafts and they will show up here as ready for Pulse's internal publishing queue."
          />
        ) : (
          <div className="space-y-4">{buckets.ready.map((item) => <ContentCard key={item.id} item={item} />)}</div>
        )}
      </TabsContent>

      <TabsContent value="queue">
        {buckets.activeQueue.length === 0 ? (
          <EmptyState
            icon={CircleDashed}
            title="Queue is empty"
            description="Add ready items to the internal queue, schedule them, and export publish packs from here."
          />
        ) : (
          <div className="space-y-4">{buckets.activeQueue.map((item) => <ContentCard key={item.id} item={item} />)}</div>
        )}
      </TabsContent>

      <TabsContent value="published">
        {buckets.published.length === 0 ? (
          <EmptyState
            icon={ExternalLink}
            title="No items marked published"
            description="After posting from your social tool, mark items as published to close the loop in Pulse."
          />
        ) : (
          <div className="space-y-4">{buckets.published.map((item) => <ContentCard key={item.id} item={item} />)}</div>
        )}
      </TabsContent>

      <TabsContent value="failed">
        {buckets.failed.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No failed items"
            description="If a publish attempt fails externally, mark it failed and return it to queue when ready."
          />
        ) : (
          <div className="space-y-4">{buckets.failed.map((item) => <ContentCard key={item.id} item={item} />)}</div>
        )}
      </TabsContent>
    </Tabs>
  );
}
