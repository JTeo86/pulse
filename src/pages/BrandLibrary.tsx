import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, format, isAfter, isBefore, startOfDay } from 'date-fns';
import {
  Archive, ArrowLeft, Clock3, Edit3, Image as ImageIcon, Loader2,
  Sparkles, Trash2, Wand2, MoreHorizontal, Check, Maximize2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { normalizeContentAssetType } from '@/lib/content-item-utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { resolveAssetMediaUrl, isSignedUrl } from '@/hooks/use-resolved-media';
import { MediaImage } from '@/components/ui/media-image';
import { generateExplanation } from '@/lib/explanations';

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
  thumbnail_url?: string | null;
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

interface SelectableVenueAsset {
  id: string;
  title: string | null;
  source_type: string | null;
  asset_type: string | null;
  created_at: string;
  storage_path: string | null;
  media_url: string | null;
  resolvedUrl: string | null;
}

type TopLevelTab = 'ready' | 'ideas' | 'photos';
type ReadinessState = 'ready_to_post' | 'needs_image' | 'needs_caption' | 'unformed';
type ConversionResult = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function BrandLibraryPage() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>((searchParams.get('tab') as TopLevelTab) || 'ready');
  const [scheduleTarget, setScheduleTarget] = useState<LibraryItem | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [editTarget, setEditTarget] = useState<LibraryItem | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedBrief, setEditedBrief] = useState('');
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [brokenImageKeys, setBrokenImageKeys] = useState<Set<string>>(new Set());
  const [attachTarget, setAttachTarget] = useState<LibraryItem | null>(null);
  const [venueImageAssets, setVenueImageAssets] = useState<SelectableVenueAsset[]>([]);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [attachingAssetId, setAttachingAssetId] = useState<string | null>(null);
  const [assetLightbox, setAssetLightbox] = useState<SelectableVenueAsset | null>(null);

  const autopilotRunIdFilter = searchParams.get('autopilotRunId');
  const topLevelTabParam = searchParams.get('tab');
  const resolvedTopLevelTab: TopLevelTab = topLevelTabParam === 'ideas' || topLevelTabParam === 'photos' ? topLevelTabParam : 'ready';

  useEffect(() => {
    setTopLevelTab(resolvedTopLevelTab);
  }, [resolvedTopLevelTab]);

  const handleTopLevelTabChange = (value: string) => {
    const nextTab: TopLevelTab = value === 'ideas' || value === 'photos' ? value : 'ready';
    setTopLevelTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'ready') nextParams.delete('tab');
    else nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

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
      .select('id, venue_id, source_type, status, title, public_url, thumbnail_url, storage_path, storage_bucket, asset_type, created_at')
      .eq('venue_id', currentVenue.id)
      .in('pool', ['content_library', 'asset_pool'])
      .order('created_at', { ascending: false })
      .limit(300);

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

  const contentItems = useMemo(() => items.filter((item) => item.origin === 'content_item'), [items]);
  const photoItems = useMemo(() => items.filter((item) => item.origin === 'content_asset'), [items]);

  const filteredContentItems = useMemo(() => {
    return contentItems.filter((item) => {
      if (autopilotRunIdFilter && item.autopilot_run_id !== autopilotRunIdFilter) return false;
      if (contentItemIdsFilter && !contentItemIdsFilter.has(item.id)) return false;
      if (item.status === 'archived' || item.status === 'published') return false;
      return true;
    });
  }, [autopilotRunIdFilter, contentItemIdsFilter, contentItems]);

  const readyItems = useMemo(() => {
    return filteredContentItems
      .filter((item) => item.status !== 'scheduled')
      .filter((item) => getReadinessState(item) !== 'unformed')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filteredContentItems]);

  const ideaItems = useMemo(() => {
    return filteredContentItems
      .filter((item) => item.status !== 'scheduled')
      .filter((item) => {
        const readiness = getReadinessState(item);
        const needsApproval = item.source === 'autopilot' && !['approved', 'scheduled', 'published'].includes(item.status);
        const draftStatus = ['draft', 'needs_changes'].includes(item.status);
        return needsApproval || draftStatus || readiness === 'unformed';
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filteredContentItems]);

  const daysCovered = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 7);
    const coveredDays = new Set<number>();

    for (const item of contentItems) {
      if (!item.scheduled_for) continue;
      const date = new Date(item.scheduled_for);
      if (!(isAfter(date, addDays(start, -1)) && isBefore(date, end))) continue;
      coveredDays.add(date.getDay());
    }

    return coveredDays.size;
  }, [contentItems]);

  const summary = useMemo(() => {
    let readyCount = 0;
    let needsWorkCount = 0;

    for (const item of readyItems) {
      const primaryAction = getPrimaryAction(item);
      if (primaryAction.label === 'Add to Calendar') readyCount += 1;
      else needsWorkCount += 1;
    }

    return { readyCount, needsWorkCount, daysCovered };
  }, [daysCovered, readyItems]);

  const handleSendToCalendar = async (item: LibraryItem, forcedDate?: string | null) => {
    const eligibility = getCalendarSendEligibility(item);
    if (!eligibility.ok) {
      toast({ variant: 'destructive', title: 'Cannot send to calendar', description: (eligibility as any).reason });
      return;
    }

    const schedule = forcedDate || item.suggested_scheduled_for || item.scheduled_for;
    if (!schedule) {
      setScheduleTarget(item);
      return;
    }

    if (item.origin === 'content_item') {
      const patch = {
        status: 'scheduled',
        scheduled_for: schedule,
        caption_final: item.caption_final || item.caption_draft || null,
        source_plan_title: item.source === 'autopilot' ? 'Content Scheduled (Pulse)' : 'Content Scheduled',
      };
      const { error } = await supabase.from('content_items').update(patch).eq('id', item.id);
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to send to calendar', description: error.message });
        return;
      }
      toast({ title: 'Sent to calendar' });
      fetchItems();
      return;
    }

    const conversion = buildAssetBackedContentItem(item, schedule);
    if (!conversion.ok) {
      toast({ variant: 'destructive', title: 'Cannot send to calendar', description: (conversion as any).reason });
      return;
    }

    const { error } = await supabase.from('content_items').insert(conversion.payload as any);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to send to calendar',
        description: 'This item could not be converted into a schedulable post. Please edit it and try again.',
      });
      return;
    }
    toast({ title: 'Sent to calendar' });
    fetchItems();
  };

  const archiveItem = async (item: LibraryItem) => {
    const table = item.origin === 'content_asset' ? 'content_assets' : 'content_items';
    const { error } = await supabase.from(table).update({ status: 'archived' } as any).eq('id', item.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Archive failed', description: error.message });
      return;
    }
    toast({ title: 'Archived' });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const confirmed = window.confirm(`Delete "${item.title || 'Untitled'}"? This cannot be undone.`);
    if (!confirmed) return;
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

  const loadVenueImageAssets = useCallback(async () => {
    if (!currentVenue) return;

    setAssetPickerLoading(true);
    const { data, error } = await supabase
      .from('content_assets')
      .select('id, title, source_type, asset_type, created_at, public_url, thumbnail_url, storage_path, storage_bucket')
      .eq('venue_id', currentVenue.id)
      .eq('pool', 'asset_pool')
      .eq('asset_type', 'image')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      toast({ variant: 'destructive', title: 'Unable to load assets', description: error.message });
      setAssetPickerLoading(false);
      return;
    }

    const mapped = await Promise.all((data || []).map(async (asset: any) => {
      const resolvedUrl = await resolveAssetMediaUrl({
        public_url: asset.public_url,
        thumbnail_url: asset.thumbnail_url,
        storage_path: asset.storage_path,
      });

      return {
        id: asset.id,
        title: asset.title || null,
        source_type: asset.source_type || null,
        asset_type: asset.asset_type || null,
        created_at: asset.created_at,
        storage_path: asset.storage_path || null,
        media_url: asset.public_url || asset.thumbnail_url || null,
        resolvedUrl: resolvedUrl || asset.public_url || asset.thumbnail_url || null,
      } as SelectableVenueAsset;
    }));

    setVenueImageAssets(mapped.filter((asset) => !!asset.resolvedUrl));
    setAssetPickerLoading(false);
  }, [currentVenue, toast]);

  const openAttachImagePicker = async (item: LibraryItem) => {
    setAttachTarget(item);
    setAssetSearch('');
    setAttachingAssetId(null);
    await loadVenueImageAssets();
  };

  const handleAttachAsset = async (selectedAsset: SelectableVenueAsset) => {
    if (!attachTarget) return;
    setAttachingAssetId(selectedAsset.id);

    const currentVariants = (attachTarget.media_variants && typeof attachTarget.media_variants === 'object')
      ? attachTarget.media_variants as Record<string, unknown>
      : {};

    const nextVariants: Record<string, unknown> = {
      ...currentVariants,
      content_asset_id: selectedAsset.id,
      asset_id: selectedAsset.id,
      source_type: selectedAsset.source_type,
      attached_via: 'brand_library',
      attached_at: new Date().toISOString(),
    };

    const normalizedType = normalizeContentAssetType(
      selectedAsset.asset_type || selectedAsset.source_type,
      null,
      selectedAsset.storage_path || selectedAsset.media_url || undefined,
    );

    const { error } = await supabase
      .from('content_items')
      .update({
        media_master_url: selectedAsset.media_url || selectedAsset.resolvedUrl,
        storage_path: selectedAsset.storage_path,
        asset_type: normalizedType,
        media_variants: nextVariants as unknown as Record<string, never>,
      })
      .eq('id', attachTarget.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Attach failed', description: error.message });
      setAttachingAssetId(null);
      return;
    }

    toast({ title: 'Image attached', description: 'The selected venue asset is now attached to this content item.' });
    setAttachTarget(null);
    setAttachingAssetId(null);
    setAssetLightbox(null);
    fetchItems();
  };

  const filteredAttachAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const sorted = [...venueImageAssets].sort((a, b) => {
      const reusableA = a.source_type === 'reusable' ? 1 : 0;
      const reusableB = b.source_type === 'reusable' ? 1 : 0;
      if (reusableA !== reusableB) return reusableB - reusableA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    if (!query) return sorted;

    return sorted.filter((asset) => {
      const haystack = `${asset.title || ''} ${asset.source_type || ''} ${asset.asset_type || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assetSearch, venueImageAssets]);

  const approveItem = async (item: LibraryItem) => {
    if (item.origin === 'content_item') {
      const { error } = await supabase.from('content_items').update({ status: 'approved' }).eq('id', item.id);
      if (error) {
        toast({ variant: 'destructive', title: 'Approve failed', description: error.message });
        return;
      }
      toast({ title: 'Approved' });
      fetchItems();
      return;
    }

    toast({ title: 'Open item', description: 'This item needs to be converted into a post before approval.' });
    openEdit(item);
  };

  const runPrimaryAction = async (item: LibraryItem) => {
    const action = getPrimaryAction(item);
    if (action.key === 'approve') {
      await approveItem(item);
      return;
    }
    if (action.key === 'add_image') {
      await openAttachImagePicker(item);
      return;
    }
    if (action.key === 'write_caption') {
      openEdit(item);
      return;
    }
    if (action.key === 'schedule') {
      await handleSendToCalendar(item);
      return;
    }
    openEdit(item);
  };

  return (
    <div className="space-y-6">
      {autopilotRunIdFilter && (
        <Button variant="ghost" size="sm" className="w-fit gap-2" onClick={() => navigate('/home')}>
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Button>
      )}
      <PageHeader
        title="Ready"
        description="Review what Pulse prepared, finish anything missing, then send to Calendar."
        action={(
          <Button className="gap-2" onClick={() => navigate('/content/feed')}>
            <ImageIcon className="w-4 h-4" /> Add Photos
          </Button>
        )}
      />

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="px-2 py-1">{summary.readyCount} ready</Badge>
            <Badge variant="outline" className="px-2 py-1 border-amber-500/40 text-amber-700 dark:text-amber-300">{summary.needsWorkCount} need work</Badge>
            <Badge variant="outline" className="px-2 py-1">{summary.daysCovered} days covered</Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs value={topLevelTab} onValueChange={handleTopLevelTabChange}>
        <TabsList>
          <TabsTrigger value="ready">Ready</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {topLevelTab === 'ready' && (
            readyItems.length === 0 ? (
              <EmptyState icon={Sparkles} title="Nothing ready yet" description="Add photos or create a plan, then come back here to review ready posts." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {readyItems.map((item) => {
                  const displayImageUrl = getDisplayImageUrl(item);
                  const readiness = getReadinessState(item);
                  const readinessBadge = getReadinessBadge(readiness);
                  const primaryAction = getPrimaryAction(item);

                  return (
                    <Card key={buildItemKey(item)} className="overflow-hidden">
                      {displayImageUrl ? (
                        <button
                          type="button"
                          className="group/image relative block w-full h-40 bg-muted cursor-pointer overflow-hidden"
                          onClick={() => openPreview(item)}
                          aria-label={`Preview ${item.title || 'content image'}`}
                        >
                          <img
                            src={displayImageUrl}
                            alt={item.title || 'Content preview'}
                            className="h-40 w-full object-cover transition-transform duration-200 group-hover/image:scale-[1.02]"
                            loading="lazy"
                            onError={() => markImageBroken(item)}
                          />
                          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover/image:bg-black/20" />
                          <div className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 group-hover/image:opacity-100">
                            <Maximize2 className="h-3.5 w-3.5" />
                          </div>
                        </button>
                      ) : (
                        <div className="h-40 bg-muted/50 flex flex-col items-center justify-center text-center px-4">
                          <ImageIcon className="w-8 h-8 text-muted-foreground/40 mb-2" />
                          <p className="text-sm font-medium">No image yet</p>
                        </div>
                      )}
                      <CardContent className="p-4 space-y-3">
                        <div className="space-y-1">
                          <p className="font-medium text-sm line-clamp-1">{item.title || 'Untitled post'}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.caption_draft || item.caption_final || 'Add details to complete this post.'}</p>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          <Badge variant={readinessBadge.variant}>{readinessBadge.label}</Badge>
                          <Badge variant="outline">{getSourceLabel(item)}</Badge>
                        </div>

                        <Button size="sm" className="w-full" onClick={() => runPrimaryAction(item)}>
                          {primaryAction.label}
                        </Button>

                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="More actions" title="More actions">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(item)}>
                                <Edit3 className="w-4 h-4 mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}`)}>
                                <Wand2 className="w-4 h-4 mr-2" />Open Pro Photo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => archiveItem(item)}>
                                <Archive className="w-4 h-4 mr-2" />Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          {topLevelTab === 'ideas' && (
            ideaItems.length === 0 ? (
              <EmptyState icon={Sparkles} title="No ideas right now" description="Pulse suggestions and drafts will show up here." />
            ) : (
              <div className="space-y-3">
                {ideaItems.map((item) => {
                  const displayImageUrl = getDisplayImageUrl(item);
                  return (
                    <Card key={buildItemKey(item)}>
                      <CardContent className="p-4 flex flex-col md:flex-row gap-3">
                        <MediaImage
                          src={item.thumbnail_url || displayImageUrl}
                          fallbackSrc={displayImageUrl}
                          alt={item.title || 'Idea preview'}
                          containerClassName="h-20 w-full md:w-28 shrink-0 rounded-md"
                          aspectClassName=""
                          className="h-full w-full object-cover"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{getSourceLabel(item)}</Badge>
                            <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), 'EEE, MMM d')}</p>
                          </div>
                          <p className="text-sm font-medium line-clamp-1">{item.title || 'Untitled idea'}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.caption_draft || item.caption_final || 'Draft concept waiting for your review.'}</p>
                          <div className="rounded-md bg-muted/30 px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Why Pulse suggested this</p>
                            <ul className="mt-1 list-disc pl-4 space-y-0.5">
                              {generateQueueExplanation(item, []).map((point) => (
                                <li key={point} className="text-xs text-muted-foreground">{point}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => approveItem(item)}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" aria-label="More actions" title="More actions">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => archiveItem(item)}>
                                  <Archive className="w-4 h-4 mr-2" />Archive
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          {topLevelTab === 'photos' && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium">Photos</p>
                    <p className="text-xs text-muted-foreground">Upload, browse, and reuse your raw photo bank.</p>
                  </div>
                  <Button size="sm" className="gap-2" onClick={() => navigate('/content/feed')}>
                    <ImageIcon className="w-4 h-4" /> Upload Photos
                  </Button>
                </div>

                {photoItems.length === 0 ? (
                  <EmptyState icon={ImageIcon} title="No photos yet" description="Upload photos to start building your bank." />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {photoItems.map((item) => {
                      const displayImageUrl = getDisplayImageUrl(item);
                      return (
                        <button
                          key={buildItemKey(item)}
                          type="button"
                          onClick={() => openPreview(item)}
                          className="group rounded-md border overflow-hidden text-left bg-muted/20"
                        >
                          {displayImageUrl ? (
                            <img
                              src={displayImageUrl}
                              alt={item.title || 'Photo'}
                              className="w-full aspect-square object-cover"
                              onError={() => markImageBroken(item)}
                            />
                          ) : (
                            <div className="w-full aspect-square bg-muted flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="p-2">
                            <p className="text-xs font-medium line-clamp-1">{item.title || 'Untitled photo'}</p>
                            <p className="text-[11px] text-muted-foreground">{format(new Date(item.created_at), 'MMM d, yyyy')}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
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

      <Dialog open={!!attachTarget} onOpenChange={(open) => !open && setAttachTarget(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Add Image</DialogTitle>
            <DialogDescription>
              Choose a photo to attach to “{attachTarget?.title || 'Untitled'}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Search by title or source (uploaded, pro_photo, reusable...)"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
            />

            {assetPickerLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filteredAttachAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No venue photos found.</p>
            ) : (
              <div className="max-h-[460px] overflow-y-auto rounded-md border p-3">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredAttachAssets.map((asset) => (
                    <div key={asset.id} className="group relative rounded-md border overflow-hidden bg-muted/20">
                      <button
                        type="button"
                        onClick={() => handleAttachAsset(asset)}
                        disabled={!!attachingAssetId}
                        className="w-full text-left"
                      >
                        <img src={asset.resolvedUrl || ''} alt={asset.title || 'Asset preview'} className="w-full aspect-square object-cover bg-muted" />
                        <div className="p-2 space-y-1">
                          <p className="font-medium text-xs line-clamp-1">{asset.title || 'Untitled image'}</p>
                          <p className="text-[11px] text-muted-foreground">{format(new Date(asset.created_at), 'MMM d, yyyy')} · {asset.asset_type || 'image'}</p>
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                          <span className="text-[11px] font-medium px-2 py-1 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity">Attach</span>
                        </div>
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAssetLightbox(asset);
                        }}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </Button>
                      {attachingAssetId === asset.id && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachTarget(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assetLightbox} onOpenChange={(open) => !open && setAssetLightbox(null)}>
        <DialogContent className="max-w-3xl">
          {assetLightbox && (
            <>
              <DialogHeader>
                <DialogTitle>{assetLightbox.title || 'Image preview'}</DialogTitle>
                <DialogDescription>
                  {format(new Date(assetLightbox.created_at), 'MMM d, yyyy')} · {assetLightbox.asset_type || 'image'}
                </DialogDescription>
              </DialogHeader>
              <img src={assetLightbox.resolvedUrl || ''} alt={assetLightbox.title || 'Image preview'} className="w-full max-h-[70vh] rounded-md object-contain bg-muted" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssetLightbox(null)}>Close</Button>
                <Button onClick={() => handleAttachAsset(assetLightbox)} disabled={!!attachingAssetId}>
                  {attachingAssetId === assetLightbox.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  Attach to Post
                </Button>
              </DialogFooter>
            </>
          )}
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
    media_url: row.thumbnail_url || row.public_url || null,
    thumbnail_url: row.thumbnail_url || null,
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

function getReadinessState(item: LibraryItem): ReadinessState {
  const hasAsset = !!(item.resolvedUrl || item.media_url);
  const hasCaption = hasUsableCaption(item.caption_final) || hasUsableCaption(item.caption_draft);
  const hasFallbackCopy = hasUsableTitle(item.title);
  const hasCopy = hasCaption || hasFallbackCopy;

  if (hasAsset && hasCopy) return 'ready_to_post';
  if (hasCopy && !hasAsset) return 'needs_image';
  if (hasAsset && !hasCopy) return 'needs_caption';
  return 'unformed';
}

function getReadinessBadge(readiness: ReadinessState): { label: string; variant: 'outline' | 'secondary' | 'default' } {
  if (readiness === 'ready_to_post') return { label: 'Ready to Post', variant: 'default' };
  if (readiness === 'needs_image') return { label: 'Needs Image', variant: 'outline' };
  if (readiness === 'needs_caption') return { label: 'Needs Caption', variant: 'secondary' };
  return { label: 'Needs Caption', variant: 'secondary' };
}

function getPrimaryAction(item: LibraryItem): { key: 'approve' | 'add_image' | 'write_caption' | 'schedule' | 'edit'; label: string } {
  const readiness = getReadinessState(item);
  const needsApproval = item.source === 'autopilot' && !['approved', 'scheduled', 'published'].includes(item.status);
  if (needsApproval) return { key: 'approve', label: 'Approve' };
  if (readiness === 'needs_image') return { key: 'add_image', label: 'Add Image' };
  if (readiness === 'needs_caption') return { key: 'write_caption', label: 'Write Caption' };
  if (readiness === 'ready_to_post') return { key: 'schedule', label: 'Add to Calendar' };
  return { key: 'edit', label: 'Edit' };
}

function hasUsableCaption(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().length >= 8;
}

function hasUsableTitle(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 10) return false;
  return trimmed.split(/\s+/).length >= 2;
}

function getCalendarSendEligibility(item: LibraryItem): { ok: true } | { ok: false; reason: string } {
  const hasAsset = !!(item.resolvedUrl || item.media_url);
  if (!hasAsset) return { ok: false, reason: 'Add or attach media before scheduling this item.' };

  const hasCopy = hasUsableCaption(item.caption_final) || hasUsableCaption(item.caption_draft) || hasUsableTitle(item.title);
  if (!hasCopy) return { ok: false, reason: 'Add a title or caption before scheduling this item.' };

  if (item.origin === 'content_asset') {
    const normalizedType = normalizeContentAssetType(
      item.asset_type || item.source_type,
      null,
      item.storage_path || item.media_url || undefined,
    );
    if (!normalizedType) return { ok: false, reason: 'This asset type is unsupported for calendar posts.' };
  }

  return { ok: true };
}

function buildAssetBackedContentItem(item: LibraryItem, schedule: string): ConversionResult {
  const mediaMasterUrl = item.resolvedUrl || item.media_url;
  if (!mediaMasterUrl) {
    return { ok: false, reason: 'No media was found for this asset.' };
  }

  const caption = item.caption_final?.trim()
    || item.caption_draft?.trim()
    || item.title?.trim()
    || null;
  if (!caption) {
    return { ok: false, reason: 'Add a caption or title before scheduling this asset.' };
  }

  const normalizedAssetType = normalizeContentAssetType(
    item.asset_type || item.source_type,
    null,
    item.storage_path || mediaMasterUrl,
  );

  const sourceLabel = item.source_type ? `Asset Scheduled (${item.source_type})` : 'Asset Scheduled';

  return {
    ok: true,
    payload: {
      venue_id: item.venue_id,
      title: item.title || null,
      caption_draft: caption,
      caption_final: caption,
      status: 'scheduled',
      scheduled_for: schedule,
      media_master_url: mediaMasterUrl,
      storage_path: item.storage_path,
      asset_type: normalizedAssetType,
      source: 'manual',
      source_plan_title: sourceLabel,
      content_brief: item.content_brief || null,
      creative_brief: item.creative_brief || null,
    },
  };
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

function getSourceLabel(item: LibraryItem): string {
  const sourceType = (item.source_type || '').toLowerCase();
  const runType = (item.run_type || '').toLowerCase();
  const badges = (item.badges || []).map((badge) => badge.toLowerCase());
  if (
    runType.includes('review') ||
    badges.some((badge) => badge.includes('review')) ||
    (item.content_brief || '').toLowerCase().includes('review')
  ) return 'Review-driven';
  if (item.campaign_tag || item.source === 'planner' || (item.source_plan_title || '').toLowerCase().includes('campaign')) return 'Campaign';
  if (item.source === 'manual') return 'Manual';
  if (
    item.source === 'autopilot' ||
    item.source === 'generated' ||
    sourceType.includes('generated') ||
    sourceType.includes('pro_photo') ||
    sourceType.includes('editor') ||
    sourceType.includes('ai') ||
    runType.includes('photo') ||
    runType.includes('editor') ||
    runType.includes('image')
  ) return 'Pulse suggested';
  return item.source;
}

function generateQueueExplanation(item: LibraryItem, coverageGaps: string[]): string[] {
  const reviewSignal = getSourceLabel(item) === 'Review-driven'
    ? ['This theme is trending in recent reviews']
    : [];
  const timingDay = item.scheduled_for
    ? new Date(item.scheduled_for).toLocaleDateString('en-US', { weekday: 'long' })
    : null;

  return generateExplanation({
    content_gap: coverageGaps,
    review_signal: reviewSignal,
    timing: timingDay ? { day_of_week: timingDay } : undefined,
    asset_usage: { reuse_frequency: item.source === 'autopilot' ? 'low' : 'balanced' },
  });
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
