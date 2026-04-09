import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Download, ImageOff, Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MediaImage } from '@/components/ui/media-image';
import { useToast } from '@/hooks/use-toast';
import { buildInternalPublishingAdapter, normalizePublishingStatus, type PublishingAction } from '@/lib/publishing-adapters';

interface ContentItem {
  id: string;
  intent: string | null;
  caption_final: string | null;
  media_master_url: string | null;
  media_variants: unknown;
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

function extractFirstHttpUrl(value: unknown, preferredKeys: string[] = []) {
  if (!value) return null;
  const queue: unknown[] = [value];
  const preferred = new Set(preferredKeys.map((key) => key.toLowerCase()));

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === 'string' && current.startsWith('http')) return current;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      const prioritized: unknown[] = [];
      const normal: unknown[] = [];
      for (const [key, val] of Object.entries(record)) {
        if (preferred.has(key.toLowerCase())) prioritized.push(val);
        else normal.push(val);
      }
      queue.push(...prioritized, ...normal);
    }
  }

  return null;
}

function extractFirstStringByKeys(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object') return null;
  const queue: unknown[] = [value];
  const keyset = new Set(keys.map((key) => key.toLowerCase()));

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, val] of Object.entries(current as Record<string, unknown>)) {
      if (typeof val === 'string' && keyset.has(key.toLowerCase())) return val;
      if (val && typeof val === 'object') queue.push(val);
      if (Array.isArray(val)) queue.push(...val);
    }
  }

  return null;
}

function formatChannelLabel(item: ContentItem) {
  const variantChannel = extractFirstStringByKeys(item.media_variants, ['channel', 'platform']);

  if (variantChannel) return variantChannel;
  if (!item.intent) return null;

  return item.intent
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function resolveQueueImage(item: ContentItem) {
  const lightweight = extractFirstHttpUrl(item.media_variants, ['thumbnail_url', 'thumbnail', 'preview_url', 'preview']);
  return lightweight || item.media_master_url;
}

export function InternalPublishingQueue() {
  const navigate = useNavigate();
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
          .select('id, intent, caption_final, media_master_url, media_variants, status, scheduled_for, created_at')
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

  const handleRemoveFromQueue = async (item: ContentItem) => {
    if (!currentVenue || !user || !isAdmin) return;
    setActingOnId(item.id);
    try {
      const updates = { status: 'ready', scheduled_for: null };
      const { error } = await supabase.from('content_items').update(updates).eq('id', item.id);
      if (error) throw error;

      await supabase.from('audit_log').insert({
        venue_id: currentVenue.id,
        user_id: user.id,
        action: 'publishing_remove_from_queue',
        entity_type: 'content_item',
        entity_id: item.id,
        meta: {
          removed_from_queue: true,
          previous_status: item.status,
          ...updates,
        },
      });

      setScheduleValues((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setItems((prev) => prev.map((existing) => (existing.id === item.id ? { ...existing, ...updates } : existing)));
      toast({ title: 'Removed from queue' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not remove item from queue',
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
      'Pulse Publish Pack',
      `Item ID: ${item.id}`,
      `Intent: ${item.intent || 'standard'}`,
      `Queue Status: ${normalizePublishingStatus(item.status)}`,
      `Scheduled for: ${scheduledAt || 'Not scheduled'}`,
      '',
      'External Posting Checklist',
      '--------------------------',
      '1. Import/upload image asset in your scheduler or social app.',
      '2. Paste caption from this pack.',
      '3. Confirm channel-specific formatting and links.',
      '4. Post externally, then return to Pulse and mark as published.',
      '',
      'Caption',
      '-------',
      caption || '(No caption set)',
    ].join('\n');

    downloadTextFile(exportSummary, `${safeSlug}-caption.txt`);
    const imageUrl = resolveQueueImage(item);
    if (imageUrl) {
      await downloadUrlToFile(imageUrl, `${safeSlug}-image`);
    }

    await applyAction(item, 'mark_exported', {
      exported_at: new Date().toISOString(),
      export_files: {
        caption: `${safeSlug}-caption.txt`,
        image_included: Boolean(imageUrl),
      },
    });
  };

  const grouped = useMemo(() => {
    const groups = {
      needsScheduling: [] as ContentItem[],
      scheduled: [] as ContentItem[],
      readyForExport: [] as ContentItem[],
      published: [] as ContentItem[],
      failed: [] as ContentItem[],
    };

    items.forEach((item) => {
      const uiStatus = normalizePublishingStatus(item.status);
      if (uiStatus === 'published') {
        groups.published.push(item);
        return;
      }
      if (uiStatus === 'failed') {
        groups.failed.push(item);
        return;
      }
      if (uiStatus === 'exported') {
        groups.readyForExport.push(item);
        return;
      }
      if (item.scheduled_for) {
        groups.scheduled.push(item);
        return;
      }
      groups.needsScheduling.push(item);
    });

    return groups;
  }, [items]);

  const summary = useMemo(() => {
    const now = new Date();
    const weekAhead = new Date(now);
    weekAhead.setDate(now.getDate() + 7);

    const scheduledThisWeek = grouped.scheduled.filter((item) => {
      if (!item.scheduled_for) return false;
      const publishAt = new Date(item.scheduled_for);
      return publishAt >= now && publishAt <= weekAhead;
    }).length;

    return {
      readyItems: grouped.needsScheduling.length + grouped.scheduled.length + grouped.readyForExport.length,
      scheduledItems: grouped.scheduled.length,
      needTiming: grouped.needsScheduling.length,
      scheduledThisWeek,
      readyForExport: grouped.readyForExport.length,
    };
  }, [grouped]);

  const ContentCard = ({ item }: { item: ContentItem }) => {
    const uiStatus = normalizePublishingStatus(item.status);
    const channel = formatChannelLabel(item);
    const imageUrl = resolveQueueImage(item);
    const isPublished = uiStatus === 'published';

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-4"
      >
        <div className="flex gap-4">
          <div className="w-24 h-24 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
            {imageUrl ? (
              <MediaImage
                src={imageUrl}
                alt=""
                aspectClassName="w-full h-full"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageOff className="w-5 h-5" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {channel && <span className="text-xs text-muted-foreground">{channel}</span>}
              <StatusBadge status={uiStatus} />
              <span className="text-xs text-muted-foreground">
                {item.scheduled_for ? `Scheduled ${new Date(item.scheduled_for).toLocaleString()}` : 'Not scheduled'}
              </span>
            </div>

            <p className="text-sm line-clamp-2">{item.caption_final || 'No caption yet'}</p>

            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                {!isPublished && (
                  <>
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
                      Set time
                    </Button>
                  </>
                )}

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

                {!isPublished && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportPack(item)}
                    disabled={actingOnId === item.id}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export
                  </Button>
                )}

                {!isPublished && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => applyAction(item, 'mark_published')}
                    disabled={actingOnId === item.id}
                  >
                    Mark Published
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/content/library')}
                  disabled={actingOnId === item.id}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>

                {!isPublished && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveFromQueue(item)}
                    disabled={actingOnId === item.id}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove from Queue
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  const Section = ({
    title,
    description,
    icon,
    itemsInSection,
  }: {
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    itemsInSection: ContentItem[];
  }) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            {title}
            <span className="text-muted-foreground">({itemsInSection.length})</span>
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {itemsInSection.length === 0 ? (
        <EmptyState icon={icon} title={`No ${title.toLowerCase()}`} description="You're all clear in this section." />
      ) : (
        <div className="space-y-4">{itemsInSection.map((item) => <ContentCard key={item.id} item={item} />)}</div>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card-elevated p-4">
        <p className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Ready to go live</p>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full bg-success/10 text-success px-3 py-1 text-sm font-medium">{summary.readyItems} ready</div>
          <div className="rounded-full bg-accent/20 text-accent-foreground px-3 py-1 text-sm font-medium">{summary.scheduledItems} scheduled</div>
          <div className="rounded-full bg-warning/10 text-warning px-3 py-1 text-sm font-medium">{summary.needTiming} need timing</div>
        </div>
      </div>

      <div className="card-elevated p-4">
        <h3 className="text-sm font-semibold mb-2">Publishing Status</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>{summary.scheduledThisWeek} posts scheduled this week</li>
          <li>{summary.readyForExport} ready for export</li>
          <li>{summary.needTiming} missing a time slot</li>
        </ul>
      </div>

      <Section
        title="Needs Scheduling"
        description="Approved or queued items without a publish time."
        icon={Clock3}
        itemsInSection={grouped.needsScheduling}
      />

      <Section
        title="Scheduled"
        description="Items with an assigned publish time in Pulse queue."
        icon={CalendarClock}
        itemsInSection={grouped.scheduled}
      />

      <Section
        title="Ready for Export"
        description="Prepared for external publishing workflows and handoff."
        icon={Send}
        itemsInSection={grouped.readyForExport}
      />

      <Section
        title="Published"
        description="Completed items marked as posted."
        icon={CheckCircle2}
        itemsInSection={grouped.published}
      />

      {(grouped.failed.length > 0 || items.length > 0) && (
        <Section
          title="Failed / Needs Attention"
          description="External publish issues that need review before retry."
          icon={AlertTriangle}
          itemsInSection={grouped.failed}
        />
      )}
    </div>
  );
}
