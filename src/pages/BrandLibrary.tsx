import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Archive, CalendarDays, CheckCircle2, Clock3, Edit3, Image as ImageIcon, Layers, List, Loader2,
  Sparkles, Trash2, Wand2, Link2, Eye, RefreshCw, AlertTriangle
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
  resolvedFrom?: 'content_item' | 'content_asset' | 'edited_asset' | 'editor_job' | 'media_variants' | null;
  scheduled_for: string | null;
  created_at: string;
  media_variants?: unknown;
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
  source_type?: string | null;
}

type LibraryTab = 'all' | 'autopilot' | 'uploads' | 'pro_photo' | 'archived';
type WorkflowStatusFilter = 'all' | 'draft' | 'approved' | 'scheduled' | 'published';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function BrandLibraryPage() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<LibraryTab>((searchParams.get('source') === 'autopilot' ? 'autopilot' : 'all') as LibraryTab);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>('all');
  const [view, setView] = useState<'card' | 'list'>('card');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduleTarget, setScheduleTarget] = useState<LibraryItem | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [editTarget, setEditTarget] = useState<LibraryItem | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedBrief, setEditedBrief] = useState('');
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [brokenImageKeys, setBrokenImageKeys] = useState<Set<string>>(new Set());

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

    const { data: ciData, error: ciErr } = await supabase
      .from('content_items')
      .select('id, venue_id, status, title, caption_draft, caption_final, asset_type, media_master_url, storage_path, media_variants, scheduled_for, created_at, run_type, autopilot_run_id, cta, hashtags, content_brief, creative_brief, suggested_scheduled_for, campaign_tag, badges, source, source_plan_publish_item_id, source_plan_title')
      .eq('venue_id', currentVenue.id)
      .order('created_at', { ascending: false })
      .limit(250);

    if (ciErr) {
      const { data: fallback } = await supabase
        .from('content_items')
        .select('id, venue_id, status, caption_draft, caption_final, asset_type, media_master_url, storage_path, media_variants, scheduled_for, created_at, source_plan_publish_item_id, source_plan_title')
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

    const { data: caData } = await supabase
      .from('content_assets')
      .select('id, venue_id, source_type, status, title, public_url, thumbnail_url, storage_path, asset_type, created_at')
      .eq('venue_id', currentVenue.id)
      .order('created_at', { ascending: false })
      .limit(250);

    const ciIds = new Set(unified.map((i) => i.id));
    (caData || []).forEach((row: any) => {
      if (ciIds.has(row.id)) return;
      unified.push(mapContentAsset(row));
    });

    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    await resolveUrls(unified);
    await enrichImageSources(unified, currentVenue.id);

    setItems(unified);
    setBrokenImageKeys(new Set());
    setLoading(false);
  }, [currentVenue]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function resolveUrls(list: LibraryItem[]) {
    const needsResolution = list.filter((i) => i.storage_path && (!i.resolvedUrl || isSignedUrl(i.resolvedUrl)));
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

  async function enrichImageSources(list: LibraryItem[], venueId: string) {
    const contentItems = list.filter((item) => item.origin === 'content_item');
    const candidateAssetIds = new Set<string>();
    const candidateEditedAssetIds = new Set<string>();
    const candidateEditorJobIds = new Set<string>();

    for (const item of contentItems) {
      const variant = item.media_variants;
      extractIdCandidates(variant, ['asset_id', 'content_asset_id', 'output_asset_id', 'source_asset_id']).forEach((id) => candidateAssetIds.add(id));
      extractIdCandidates(variant, ['edited_asset_id']).forEach((id) => candidateEditedAssetIds.add(id));
      extractIdCandidates(variant, ['editor_job_id', 'job_id']).forEach((id) => candidateEditorJobIds.add(id));
    }

    const [assetsRes, editedRes, jobsRes] = await Promise.all([
      candidateAssetIds.size
        ? supabase
          .from('content_assets')
          .select('id, public_url, thumbnail_url, storage_path')
          .eq('venue_id', venueId)
          .in('id', Array.from(candidateAssetIds))
        : Promise.resolve({ data: [] as any[] }),
      candidateEditedAssetIds.size
        ? supabase
          .from('edited_assets')
          .select('id, output_urls')
          .eq('venue_id', venueId)
          .in('id', Array.from(candidateEditedAssetIds))
        : Promise.resolve({ data: [] as any[] }),
      candidateEditorJobIds.size
        ? supabase
          .from('editor_jobs')
          .select('id, final_image_url, final_video_url, output_asset_id')
          .eq('venue_id', venueId)
          .in('id', Array.from(candidateEditorJobIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const assetsById = new Map((assetsRes.data || []).map((row: any) => [row.id, row]));
    const editedById = new Map((editedRes.data || []).map((row: any) => [row.id, row]));
    const jobsById = new Map((jobsRes.data || []).map((row: any) => [row.id, row]));

    for (const item of contentItems) {
      if (item.resolvedUrl || item.media_url) continue;

      const directVariantUrl = extractFirstUrl(item.media_variants);
      if (directVariantUrl) {
        item.resolvedUrl = directVariantUrl;
        item.resolvedFrom = 'media_variants';
        continue;
      }

      const assetIds = extractIdCandidates(item.media_variants, ['asset_id', 'content_asset_id', 'output_asset_id', 'source_asset_id']);
      for (const assetId of assetIds) {
        const asset = assetsById.get(assetId);
        if (!asset) continue;
        const resolved = await resolveAssetMediaUrl({
          public_url: asset.public_url,
          thumbnail_url: asset.thumbnail_url,
          storage_path: asset.storage_path,
        });
        if (resolved) {
          item.resolvedUrl = resolved;
          item.media_url = asset.public_url || asset.thumbnail_url || resolved;
          item.storage_path = item.storage_path || asset.storage_path || null;
          item.resolvedFrom = 'content_asset';
          break;
        }
      }
      if (item.resolvedUrl) continue;

      const editorJobIds = extractIdCandidates(item.media_variants, ['editor_job_id', 'job_id']);
      for (const jobId of editorJobIds) {
        const job = jobsById.get(jobId);
        if (!job) continue;

        if (job.output_asset_id && assetsById.has(job.output_asset_id)) {
          const output = assetsById.get(job.output_asset_id);
          const resolved = await resolveAssetMediaUrl({
            public_url: output.public_url,
            thumbnail_url: output.thumbnail_url,
            storage_path: output.storage_path,
          });
          if (resolved) {
            item.resolvedUrl = resolved;
            item.media_url = output.public_url || output.thumbnail_url || resolved;
            item.storage_path = item.storage_path || output.storage_path || null;
            item.resolvedFrom = 'content_asset';
            break;
          }
        }

        const fallbackJobUrl = job.final_image_url || job.final_video_url;
        if (fallbackJobUrl) {
          item.resolvedUrl = fallbackJobUrl;
          item.media_url = fallbackJobUrl;
          item.resolvedFrom = 'editor_job';
          break;
        }
      }
      if (item.resolvedUrl) continue;

      const editedAssetIds = extractIdCandidates(item.media_variants, ['edited_asset_id']);
      for (const editedId of editedAssetIds) {
        const edited = editedById.get(editedId);
        const outputUrls = Array.isArray(edited?.output_urls) ? edited.output_urls : [];
        const outputUrl = outputUrls.find((entry: unknown) => typeof entry === 'string' && entry.startsWith('http')) as string | undefined;
        if (outputUrl) {
          item.resolvedUrl = outputUrl;
          item.media_url = outputUrl;
          item.resolvedFrom = 'edited_asset';
          break;
        }
      }
    }
  }

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (autopilotRunIdFilter && item.autopilot_run_id !== autopilotRunIdFilter) return false;
      if (contentItemIdsFilter && !contentItemIdsFilter.has(item.id)) return false;

      const category = getContentCategory(item);
      if (tab === 'archived') {
        if (item.status !== 'archived') return false;
      } else {
        if (item.status === 'archived') return false;
        if (tab !== 'all' && category !== tab) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, tab, statusFilter, autopilotRunIdFilter, contentItemIdsFilter]);

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
      source_plan_title: item.source === 'autopilot' ? 'Content Scheduled (Autopilot)' : 'Content Scheduled',
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

  const getDisplayImageUrl = (item: LibraryItem) => {
    const key = buildItemKey(item);
    if (brokenImageKeys.has(key)) return null;
    return item.resolvedUrl || item.media_url || null;
  };

  const markImageBroken = (item: LibraryItem) => {
    setBrokenImageKeys((prev) => new Set(prev).add(buildItemKey(item)));
  };

  const openPreview = (item: LibraryItem) => {
    if (!getDisplayImageUrl(item)) return;
    setPreviewItem(item);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Content" description="Your content inventory. Review assets and drafts here, then send ready posts to Calendar." />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as LibraryTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
            <TabsTrigger value="uploads">Uploads</TabsTrigger>
            <TabsTrigger value="pro_photo">Pro Photo</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant={view === 'card' ? 'default' : 'outline'} size="sm" onClick={() => setView('card')}><Layers className="w-4 h-4 mr-1" />Cards</Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}><List className="w-4 h-4 mr-1" />List</Button>
        </div>
      </div>

      {tab !== 'archived' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground mr-1">Status:</p>
          {([
            { value: 'all', label: 'All statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'approved', label: 'Approved' },
            { value: 'scheduled', label: 'Scheduled' },
            { value: 'published', label: 'Published' },
          ] as const).map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={statusFilter === option.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(option.value)}
              className="h-8"
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

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
        <EmptyState icon={Sparkles} title="No content items yet" description="Run Autopilot, upload photos, or use Pro Photo to build your content inventory." />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((item) => {
            const displayImageUrl = getDisplayImageUrl(item);
            const hasAsset = !!displayImageUrl;
            const assetState = getAssetState(item, hasAsset);
            const autopilotSource = getAutopilotSourceLabel(item);

            return (
              <Card key={buildItemKey(item)} className="overflow-hidden">
                {hasAsset ? (
                  <button type="button" className="block w-full h-40 bg-muted" onClick={() => openPreview(item)}>
                    <img
                      src={displayImageUrl!}
                      alt={item.title || 'Content preview'}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                      onError={() => markImageBroken(item)}
                    />
                  </button>
                ) : (
                  <div className="h-40 bg-muted/50 flex flex-col items-center justify-center text-center px-4">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-medium">No asset yet</p>
                    <p className="text-xs text-muted-foreground">This is a copy-only draft.</p>
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
                    <Badge variant="outline">{getSourceLabel(item)}</Badge>
                    <Badge variant={hasAsset ? 'default' : 'outline'}>{hasAsset ? 'full content' : 'copy-only'}</Badge>
                    <Badge variant={assetState.variant}>{assetState.label}</Badge>
                    {item.run_type && <Badge variant="outline">{item.run_type.replace('_', ' ')}</Badge>}
                    {item.origin === 'content_asset' && <Badge variant="outline">Asset</Badge>}
                  </div>

                  {autopilotSource && (
                    <p className="text-xs text-muted-foreground">{autopilotSource}</p>
                  )}

                  {item.caption_draft && <p className="text-sm line-clamp-3">{item.caption_draft}</p>}

                  {item.origin === 'content_item' && !hasAsset && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}&action=generate`)}><Wand2 className="w-4 h-4 mr-1" />Generate Image</Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}&action=attach`)}><Link2 className="w-4 h-4 mr-1" />Attach Image</Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}`)}><Eye className="w-4 h-4 mr-1" />Open in Pro Photo</Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}&action=regenerate`)}><RefreshCw className="w-4 h-4 mr-1" />Regenerate</Button>
                    </div>
                  )}

                  {item.origin === 'content_item' && hasAsset && (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => openPreview(item)}><Eye className="w-4 h-4 mr-1" />Preview</Button>
                  )}

                  {item.origin === 'content_item' && !hasAsset && item.asset_type && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-100/40 p-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">Asset expected ({item.asset_type}) but missing.</p>
                    </div>
                  )}

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
          <div className="grid grid-cols-[32px_1fr_1fr_120px_120px] gap-2 p-3 text-xs font-medium text-muted-foreground border-b">
            <div />
            <div>Title</div>
            <div>State</div>
            <div>Status</div>
            <div>Source</div>
          </div>
          {visibleItems.map((item) => {
            const displayImageUrl = getDisplayImageUrl(item);
            const hasAsset = !!displayImageUrl;
            return (
              <div key={buildItemKey(item)} className="grid grid-cols-[32px_1fr_1fr_120px_120px] gap-2 p-3 items-center border-b last:border-b-0 text-sm">
                <Checkbox checked={selected.has(item.id)} onCheckedChange={(v) => toggleSelect(item.id, !!v)} />
                <div className="flex items-center gap-2 min-w-0">
                  {displayImageUrl ? (
                    <button type="button" onClick={() => openPreview(item)} className="w-8 h-8 rounded overflow-hidden">
                      <img src={displayImageUrl} alt="" className="w-8 h-8 rounded object-cover" onError={() => markImageBroken(item)} />
                    </button>
                  ) : (
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground/60" /></div>
                  )}
                  <span className="line-clamp-1">{item.title || 'Untitled'}</span>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1">{hasAsset ? 'Asset ready' : 'Copy generated · Asset pending'}</div>
                <Badge variant="secondary" className="w-fit">{item.status}</Badge>
                <Badge variant="outline" className="w-fit">{item.source}</Badge>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewItem && !!(previewItem && getDisplayImageUrl(previewItem))} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          <div className="bg-black/90">
            {previewItem && getDisplayImageUrl(previewItem) ? (
              <img src={getDisplayImageUrl(previewItem)!} alt={previewItem.title || 'Preview'} className="w-full max-h-[80vh] object-contain" />
            ) : (
              <div className="h-[360px] flex items-center justify-center text-muted-foreground">No preview available</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit content item</DialogTitle>
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
    resolvedFrom: row.media_master_url || row.storage_path ? 'content_item' : null,
    scheduled_for: row.scheduled_for || null,
    created_at: row.created_at,
    media_variants: row.media_variants ?? null,
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
    source_type: null,
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
    resolvedFrom: row.public_url || row.thumbnail_url || row.storage_path ? 'content_asset' : null,
    scheduled_for: null,
    created_at: row.created_at,
    source_type: row.source_type || null,
  };
}

function buildItemKey(item: LibraryItem): string {
  return `${item.origin}:${item.id}`;
}

function getAssetState(item: LibraryItem, hasAsset: boolean): { label: string; variant: 'outline' | 'secondary' | 'default' } {
  if (item.origin === 'content_asset') {
    return { label: hasAsset ? 'Asset ready' : 'Asset missing', variant: hasAsset ? 'default' : 'secondary' };
  }

  const hasCopy = !!(item.caption_draft || item.caption_final || item.title);
  if (hasAsset) {
    return { label: 'Asset ready', variant: 'default' };
  }

  if (!hasCopy) {
    return { label: 'Copy pending', variant: 'secondary' };
  }

  return { label: 'Asset pending', variant: 'outline' };
}

function getAutopilotSourceLabel(item: LibraryItem): string | null {
  if (item.source !== 'autopilot') return null;

  if (item.campaign_tag) return `Source: campaign/event · ${item.campaign_tag}`;

  const badges = (item.badges || []).map((b) => b.toLowerCase());
  if (badges.some((b) => b.includes('review'))) return 'Source: based on recent reviews';
  if (badges.some((b) => b.includes('event') || b.includes('campaign'))) return 'Source: based on active campaign/event';

  if (item.run_type === 'review_content') return 'Source: based on recent reviews';
  if (item.run_type === 'weekly_campaign') return 'Source: based on campaign/event context';

  const brief = `${item.content_brief || ''} ${item.creative_brief || ''}`.toLowerCase();
  if (brief.includes('cuisine') || brief.includes('tone') || brief.includes('brand')) {
    return 'Source: based on brand profile (cuisine/tone)';
  }

  if (brief.trim().length > 0) return 'Source: based on venue context';

  return 'Source: based on brand profile';
}

function getContentCategory(item: LibraryItem): Exclude<LibraryTab, 'all'> {
  if (item.status === 'archived') return 'archived';
  if (item.source === 'autopilot') return 'autopilot';

  const sourceType = (item.source_type || '').toLowerCase();
  const runType = (item.run_type || '').toLowerCase();
  const hasMedia = !!(item.media_url || item.storage_path || item.resolvedUrl);

  if (
    sourceType.includes('upload') ||
    sourceType.includes('manual') ||
    sourceType.includes('guest') ||
    sourceType.includes('camera') ||
    sourceType.includes('phone')
  ) {
    return 'uploads';
  }

  if (
    item.source === 'generated' ||
    sourceType.includes('generated') ||
    sourceType.includes('pro_photo') ||
    sourceType.includes('editor') ||
    sourceType.includes('ai') ||
    runType.includes('photo') ||
    runType.includes('editor') ||
    runType.includes('image')
  ) {
    return 'pro_photo';
  }

  if (item.source === 'manual' && hasMedia) return 'uploads';
  return 'uploads';
}

function getSourceLabel(item: LibraryItem): string {
  if (item.source === 'autopilot') return 'Autopilot';
  const category = getContentCategory(item);
  if (category === 'pro_photo') return 'Pro Photo';
  if (category === 'uploads') return 'Upload';
  return item.source;
}

function extractFirstUrl(value: unknown): string | null {
  if (!value) return null;
  const queue: unknown[] = [value];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === 'string' && current.startsWith('http')) {
      return current;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === 'object') {
      const objectValues = Object.values(current as Record<string, unknown>);
      queue.push(...objectValues);
    }
  }

  return null;
}

function extractIdCandidates(value: unknown, keys: string[]): string[] {
  if (!value) return [];
  const matches = new Set<string>();
  const queue: unknown[] = [value];
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== 'object') continue;

    for (const [key, raw] of Object.entries(current as Record<string, unknown>)) {
      if (typeof raw === 'string' && normalizedKeys.has(key.toLowerCase()) && UUID_RE.test(raw)) {
        matches.add(raw);
      }
      if (raw && typeof raw === 'object') queue.push(raw);
      if (Array.isArray(raw)) queue.push(...raw);
    }
  }

  return Array.from(matches);
}
