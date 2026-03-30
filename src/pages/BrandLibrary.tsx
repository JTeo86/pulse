import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Archive, CalendarDays, CheckCircle2, Clock3, Edit3, Image as ImageIcon, Layers, List, Loader2,
  PlusCircle, Rocket, Sparkles, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { resolveAssetMediaUrl, isSignedUrl } from '@/hooks/use-resolved-media';

/* ─── Unified library item shape ─── */
interface LibraryItem {
  id: string;
  venue_id: string;
  origin: 'content_item' | 'content_asset';
  source: 'autopilot' | 'planner' | 'manual' | 'generated';
  status: string;
  title: string | null;
  caption_draft: string | null;
  caption_final: string | null;
  asset_type: string | null;
  media_url: string | null;
  storage_path: string | null;
  resolvedUrl: string | null;
  scheduled_for: string | null;
  created_at: string;
  // content_item extras
  run_type?: string | null;
  autopilot_run_id?: string | null;
  cta?: string | null;
  hashtags?: string[] | null;
  content_brief?: string | null;
  creative_brief?: string | null;
  suggested_scheduled_for?: string | null;
  campaign_tag?: string | null;
  badges?: string[] | null;
  source_plan_title?: string | null;
}

type LibraryTab = 'all' | 'autopilot' | 'generated' | 'manual' | 'approved' | 'scheduled' | 'published' | 'archived';

export default function BrandLibraryPage() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<LibraryTab>((searchParams.get('source') === 'autopilot' ? 'autopilot' : 'all') as LibraryTab);
  const [view, setView] = useState<'card' | 'list'>('card');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduleTarget, setScheduleTarget] = useState<LibraryItem | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [editTarget, setEditTarget] = useState<LibraryItem | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedBrief, setEditedBrief] = useState('');

  const autopilotRunIdFilter = searchParams.get('autopilotRunId');
  const contentItemIdsFilter = useMemo(() => {
    const raw = searchParams.get('contentItemIds');
    if (!raw) return null;
    const ids = raw.split(',').map((v) => v.trim()).filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }, [searchParams]);

  const fetchItems = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);

    const unified: LibraryItem[] = [];

    // 1) Fetch content_items (autopilot + manual + planner items)
    const { data: ciData, error: ciErr } = await supabase
      .from('content_items')
      .select('id, venue_id, status, title, caption_draft, caption_final, asset_type, media_master_url, storage_path, scheduled_for, created_at, run_type, autopilot_run_id, cta, hashtags, content_brief, creative_brief, suggested_scheduled_for, campaign_tag, badges, source, source_plan_publish_item_id, source_plan_title')
      .eq('venue_id', currentVenue.id)
      .order('created_at', { ascending: false })
      .limit(250);

    if (ciErr) {
      // Fallback: try minimal select for older schemas
      const { data: fallback } = await supabase
        .from('content_items')
        .select('id, venue_id, status, caption_draft, caption_final, asset_type, media_master_url, scheduled_for, created_at, source_plan_publish_item_id, source_plan_title')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(250);
      (fallback || []).forEach((row: any) => {
        unified.push(mapContentItem(row));
      });
    } else {
      (ciData || []).forEach((row: any) => {
        unified.push(mapContentItem(row));
      });
    }

    // 2) Fetch content_assets (Pro Photo outputs, uploads, etc.)
    const { data: caData } = await supabase
      .from('content_assets')
      .select('id, venue_id, source_type, status, title, public_url, thumbnail_url, storage_path, asset_type, created_at')
      .eq('venue_id', currentVenue.id)
      .order('created_at', { ascending: false })
      .limit(250);

    // Deduplicate: content_assets already referenced by content_items won't be doubled
    const ciIds = new Set(unified.map((i) => i.id));
    (caData || []).forEach((row: any) => {
      if (ciIds.has(row.id)) return;
      unified.push(mapContentAsset(row));
    });

    // Sort by created_at desc
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Resolve image URLs for items with storage_path but no good URL
    await resolveUrls(unified);

    setItems(unified);
    setLoading(false);
  }, [currentVenue]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ─── URL resolution for items with storage paths ─── */
  async function resolveUrls(items: LibraryItem[]) {
    const needsResolution = items.filter((i) => i.storage_path && (!i.resolvedUrl || isSignedUrl(i.resolvedUrl)));
    if (!needsResolution.length) return;

    await Promise.all(needsResolution.map(async (item) => {
      try {
        const url = await resolveAssetMediaUrl({
          public_url: item.media_url,
          storage_path: item.storage_path,
        });
        item.resolvedUrl = url || null;
      } catch {
        // leave as-is
      }
    }));
  }

  /* ─── Filtering ─── */
  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (autopilotRunIdFilter && item.autopilot_run_id !== autopilotRunIdFilter) return false;
      if (contentItemIdsFilter && !contentItemIdsFilter.has(item.id)) return false;
      if (tab === 'all') return item.status !== 'archived';
      if (tab === 'autopilot') return item.source === 'autopilot';
      if (tab === 'generated') return item.source === 'generated';
      if (tab === 'manual') return item.source === 'manual';
      if (tab === 'archived') return item.status === 'archived';
      return item.status === tab;
    });
  }, [items, tab, autopilotRunIdFilter, contentItemIdsFilter]);

  /* ─── Actions (content_items only) ─── */
  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const updateMany = async (ids: string[], patch: Record<string, unknown>) => {
    if (!ids.length) return;
    const ciIds = ids.filter((id) => items.find((i) => i.id === id)?.origin === 'content_item');
    const caIds = ids.filter((id) => items.find((i) => i.id === id)?.origin === 'content_asset');
    const errors: string[] = [];

    if (ciIds.length) {
      const { error } = await supabase.from('content_items').update(patch as any).in('id', ciIds);
      if (error) errors.push(error.message);
    }
    if (caIds.length) {
      const { error } = await supabase.from('content_assets').update(patch as any).in('id', caIds);
      if (error) errors.push(error.message);
    }

    if (errors.length) {
      toast({ variant: 'destructive', title: 'Bulk update failed', description: errors.join('; ') });
    }
    setSelected(new Set());
    fetchItems();
  };

  const handleSendToCalendar = async (item: LibraryItem, forcedDate?: string | null) => {
    if (item.origin !== 'content_item') {
      toast({ title: 'Not available', description: 'Only content items can be sent to calendar.' });
      return;
    }
    const schedule = forcedDate || item.suggested_scheduled_for || item.scheduled_for;
    if (!schedule) {
      setScheduleTarget(item);
      return;
    }
    const patch = {
      status: 'scheduled',
      scheduled_for: schedule,
      caption_final: item.caption_final || item.caption_draft || null,
      source_plan_title: item.source === 'autopilot' ? 'Library Scheduled (Autopilot)' : 'Library Scheduled',
    };
    const { error } = await supabase.from('content_items').update(patch).eq('id', item.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to send to calendar', description: error.message });
      return;
    }
    toast({ title: 'Sent to calendar' });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const table = item.origin === 'content_asset' ? 'content_assets' : 'content_items';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
      return;
    }
    toast({ title: 'Item deleted' });
    fetchItems();
  };

  const openEdit = (item: LibraryItem) => {
    setEditTarget(item);
    setEditedCaption(item.caption_draft || item.caption_final || '');
    setEditedBrief(item.creative_brief || item.content_brief || '');
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (editTarget.origin === 'content_item') {
      const { error } = await supabase.from('content_items').update({ caption_draft: editedCaption, creative_brief: editedBrief }).eq('id', editTarget.id);
      if (error) { toast({ variant: 'destructive', title: 'Save failed', description: error.message }); return; }
    } else {
      const { error } = await supabase.from('content_assets').update({ title: editedCaption }).eq('id', editTarget.id);
      if (error) { toast({ variant: 'destructive', title: 'Save failed', description: error.message }); return; }
    }
    toast({ title: 'Updated' });
    setEditTarget(null);
    fetchItems();
  };

  const getImageUrl = (item: LibraryItem) => item.resolvedUrl || item.media_url || null;

  return (
    <div className="space-y-6">
      <PageHeader title="Content Library" description="Unified inventory of all content — autopilot drafts, generated images, and manual items." />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as LibraryTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
            <TabsTrigger value="generated">Pro Photo</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant={view === 'card' ? 'default' : 'outline'} size="sm" onClick={() => setView('card')}><Layers className="w-4 h-4 mr-1" />Cards</Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}><List className="w-4 h-4 mr-1" />List</Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/content/planner')}><CalendarDays className="w-4 h-4 mr-1" />Calendar</Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-lg border p-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground mr-2">{selected.size} selected</p>
          <Button size="sm" onClick={() => updateMany(Array.from(selected), { status: 'approved' })}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
          <Button size="sm" variant="outline" onClick={() => updateMany(Array.from(selected), { status: 'archived' })}><Archive className="w-4 h-4 mr-1" />Archive</Button>
          <Button size="sm" variant="destructive" onClick={() => Promise.all(Array.from(selected).map(handleDelete)).then(() => setSelected(new Set()))}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : visibleItems.length === 0 ? (
        <EmptyState icon={Sparkles} title="No content items yet" description="Run Autopilot or create content in The Editor to build your Library." />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((item) => {
            const imgUrl = getImageUrl(item);
            return (
              <Card key={`${item.origin}-${item.id}`} className="overflow-hidden">
                {imgUrl ? (
                  <img src={imgUrl} alt={item.title || ''} className="h-40 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-40 bg-muted flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                )}
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{item.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    <Checkbox checked={selected.has(item.id)} onCheckedChange={(v) => toggleSelect(item.id, !!v)} />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{item.status}</Badge>
                    <Badge variant="outline">{item.source}</Badge>
                    {item.run_type && <Badge variant="outline">{item.run_type.replace('_', ' ')}</Badge>}
                    {item.origin === 'content_asset' && <Badge variant="outline">Asset</Badge>}
                  </div>

                  {item.caption_draft && <p className="text-sm line-clamp-3">{item.caption_draft}</p>}

                  <div className="grid grid-cols-2 gap-2">
                    {item.origin === 'content_item' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => supabase.from('content_items').update({ status: 'approved' }).eq('id', item.id).then(fetchItems)}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Edit3 className="w-4 h-4 mr-1" />Edit</Button>
                        <Button size="sm" onClick={() => handleSendToCalendar(item)}><CalendarDays className="w-4 h-4 mr-1" />Calendar</Button>
                        <Button size="sm" variant="ghost" onClick={() => supabase.from('content_items').update({ status: 'archived' }).eq('id', item.id).then(fetchItems)}><Archive className="w-4 h-4 mr-1" />Archive</Button>
                      </>
                    )}
                    {item.origin === 'content_asset' && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Edit3 className="w-4 h-4 mr-1" />Edit title</Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_1fr_100px_100px] gap-2 p-3 text-xs font-medium text-muted-foreground border-b">
            <div />
            <div>Title</div>
            <div>Caption</div>
            <div>Status</div>
            <div>Source</div>
          </div>
          {visibleItems.map((item) => (
            <div key={`${item.origin}-${item.id}`} className="grid grid-cols-[32px_1fr_1fr_100px_100px] gap-2 p-3 items-center border-b last:border-b-0 text-sm">
              <Checkbox checked={selected.has(item.id)} onCheckedChange={(v) => toggleSelect(item.id, !!v)} />
              <div className="flex items-center gap-2">
                {getImageUrl(item) ? <img src={getImageUrl(item)!} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-muted" />}
                <span className="line-clamp-1">{item.title || 'Untitled'}</span>
              </div>
              <div className="line-clamp-1 text-muted-foreground">{item.caption_draft || '-'}</div>
              <Badge variant="secondary" className="w-fit">{item.status}</Badge>
              <Badge variant="outline" className="w-fit">{item.source}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Schedule dialog */}
      <Dialog open={!!scheduleTarget} onOpenChange={(v) => !v && setScheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick a schedule time</DialogTitle>
            <DialogDescription>Choose when to move this item into your calendar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Scheduled date & time</Label>
            <Input type="datetime-local" value={scheduleDateTime} onChange={(e) => setScheduleDateTime(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleTarget(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!scheduleTarget || !scheduleDateTime) return;
              handleSendToCalendar(scheduleTarget, new Date(scheduleDateTime).toISOString());
              setScheduleTarget(null);
              setScheduleDateTime('');
            }}>
              <Clock3 className="w-4 h-4 mr-1" /> Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit library item</DialogTitle>
            <DialogDescription>Update caption and creative brief.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Caption / Title</Label>
              <Textarea value={editedCaption} onChange={(e) => setEditedCaption(e.target.value)} className="min-h-32" />
            </div>
            {editTarget?.origin === 'content_item' && (
              <div className="space-y-1">
                <Label>Creative brief</Label>
                <Textarea value={editedBrief} onChange={(e) => setEditedBrief(e.target.value)} className="min-h-24" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Mappers ─── */

function mapContentItem(row: any): LibraryItem {
  const source = row.source === 'autopilot' ? 'autopilot'
    : row.autopilot_run_id || row.run_type ? 'autopilot'
    : row.source_plan_publish_item_id ? 'planner'
    : 'manual';
  return {
    id: row.id,
    venue_id: row.venue_id,
    origin: 'content_item',
    source: source as LibraryItem['source'],
    status: row.status || 'draft',
    title: row.title || null,
    caption_draft: row.caption_draft || null,
    caption_final: row.caption_final || null,
    asset_type: row.asset_type || null,
    media_url: row.media_master_url || null,
    storage_path: row.storage_path || null,
    resolvedUrl: null,
    scheduled_for: row.scheduled_for || null,
    created_at: row.created_at,
    run_type: row.run_type || null,
    autopilot_run_id: row.autopilot_run_id || null,
    cta: row.cta || null,
    hashtags: row.hashtags || null,
    content_brief: row.content_brief || null,
    creative_brief: row.creative_brief || null,
    suggested_scheduled_for: row.suggested_scheduled_for || null,
    campaign_tag: row.campaign_tag || null,
    badges: row.badges || null,
    source_plan_title: row.source_plan_title || null,
  };
}

function mapContentAsset(row: any): LibraryItem {
  return {
    id: row.id,
    venue_id: row.venue_id,
    origin: 'content_asset',
    source: 'generated',
    status: row.status || 'draft',
    title: row.title || null,
    caption_draft: null,
    caption_final: null,
    asset_type: row.asset_type || null,
    media_url: row.public_url || row.thumbnail_url || null,
    storage_path: row.storage_path || null,
    resolvedUrl: null,
    scheduled_for: null,
    created_at: row.created_at,
  };
}
