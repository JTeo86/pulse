import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, format, isAfter, isBefore, startOfDay } from 'date-fns';
import {
  Archive, ArrowLeft, CalendarDays, Clock3, Edit3, Image as ImageIcon, Layers, List, Loader2,
  Sparkles, Trash2, Wand2, Link2, Eye, RefreshCw, AlertTriangle, MoreHorizontal, Check, Maximize2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { normalizeContentAssetType } from '@/lib/content-item-utils';
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
import { getPostPerformanceLabel } from '@/lib/performance-feedback';

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

type LibraryTab = 'all' | 'ready' | 'pulse_suggested' | 'scheduled' | 'archived';
type TopLevelTab = 'queue' | 'suggestions' | 'library_uploads';
type InventoryStateFilter = 'all' | 'ready_to_post' | 'needs_image' | 'needs_caption';
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
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>((searchParams.get('tab') as TopLevelTab) || 'queue');
  const [libraryTab, setLibraryTab] = useState<LibraryTab>((searchParams.get('source') === 'autopilot' ? 'pulse_suggested' : 'all') as LibraryTab);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryStateFilter>('all');
  const [view, setView] = useState<'card' | 'list'>('card');
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
  const resolvedTopLevelTab: TopLevelTab = topLevelTabParam === 'suggestions' || topLevelTabParam === 'library_uploads' ? topLevelTabParam : 'queue';
  useEffect(() => {
    setTopLevelTab(resolvedTopLevelTab);
  }, [resolvedTopLevelTab]);

  const handleTopLevelTabChange = (value: string) => {
    const nextTab: TopLevelTab = value === 'suggestions' || value === 'library_uploads' ? value : 'queue';
    setTopLevelTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'queue') nextParams.delete('tab');
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
      .eq('pool', 'content_library')
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

      const readiness = getReadinessState(item);

      if (libraryTab === 'archived') {
        if (item.status !== 'archived') return false;
      } else if (libraryTab === 'scheduled') {
        if (!['scheduled', 'published'].includes(item.status)) return false;
      } else {
        if (['scheduled', 'published'].includes(item.status)) return false;
        if (item.status === 'archived') return false;
        if (libraryTab === 'ready' && readiness !== 'ready_to_post') return false;
        if (libraryTab === 'pulse_suggested' && item.source !== 'autopilot') return false;
      }

      if (libraryTab !== 'archived' && libraryTab !== 'scheduled' && readiness === 'unformed') return false;

      if (inventoryFilter === 'ready_to_post' && readiness !== 'ready_to_post') return false;
      if (inventoryFilter === 'needs_image' && readiness !== 'needs_image') return false;
      if (inventoryFilter === 'needs_caption' && readiness !== 'needs_caption') return false;
      return true;
    });
  }, [items, libraryTab, inventoryFilter, autopilotRunIdFilter, contentItemIdsFilter]);

  const performanceInput = useMemo(() => ({
    posts: visibleItems.map((item) => ({
      id: item.id,
      title: item.title,
      caption: item.caption_draft || item.caption_final,
      scheduledFor: item.scheduled_for,
      createdAt: item.created_at,
      reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
    })),
    frequencyPerWeek: visibleItems.length,
  }), [visibleItems]);

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

  const queueItems = useMemo(() => {
    const now = new Date();
    const in14Days = addDays(now, 14);

    return items
      .filter((item) => item.status !== 'archived' && item.status !== 'published')
      .map((item) => {
        const readiness = getReadinessState(item);
        const queueTime = item.scheduled_for || item.suggested_scheduled_for || null;
        const queueDate = queueTime ? new Date(queueTime) : null;
        const statusLabel = getQueueStatusLabel(item, readiness);
        const inWindow = queueDate
          ? isAfter(queueDate, addDays(now, -1)) && isBefore(queueDate, addDays(in14Days, 1))
          : true;
        const needsApproval = statusLabel === 'Needs approval';
        const isReadyOrScheduled = statusLabel === 'Ready' || statusLabel === 'Scheduled';
        return { item, readiness, queueTime, queueDate, statusLabel, inWindow, needsApproval, isReadyOrScheduled };
      })
      .filter((entry) => entry.inWindow)
      .sort((a, b) => {
        if (a.queueDate && b.queueDate) return a.queueDate.getTime() - b.queueDate.getTime();
        if (a.queueDate && !b.queueDate) return -1;
        if (!a.queueDate && b.queueDate) return 1;
        return new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime();
      });
  }, [items]);

  const queueSections = useMemo(() => {
    const needsApproval = queueItems.filter((entry) => entry.needsApproval);
    const readyScheduled = queueItems.filter((entry) => !entry.needsApproval && entry.isReadyOrScheduled);
    const ideas = queueItems.filter((entry) => !entry.needsApproval && !entry.isReadyOrScheduled);
    return { needsApproval, readyScheduled, ideas };
  }, [queueItems]);

  const coverageSummary = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 7);
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const coveredDays = new Set<number>();
    let hasLunchContent = false;

    for (const entry of queueItems) {
      if (!entry.queueDate) continue;
      if (!(isAfter(entry.queueDate, addDays(start, -1)) && isBefore(entry.queueDate, end))) continue;
      coveredDays.add(entry.queueDate.getDay());
      const hour = entry.queueDate.getHours();
      if (hour >= 11 && hour <= 14) hasLunchContent = true;
    }

    const missingDayNames = Array.from({ length: 7 }, (_, offset) => addDays(start, offset))
      .filter((date) => !coveredDays.has(date.getDay()))
      .map((date) => weekdayNames[date.getDay()]);

    const gaps: string[] = [];
    if (missingDayNames.includes('Friday')) gaps.push('Missing Friday');
    if (missingDayNames.includes('Saturday') || missingDayNames.includes('Sunday')) gaps.push('Missing weekend');
    if (!hasLunchContent) gaps.push('No lunch content');

    return {
      coveredDaysCount: 7 - missingDayNames.length,
      missingDayNames,
      gaps,
    };
  }, [queueItems]);

  const headerSummary = useMemo(() => {
    const readyCount = queueItems.filter((entry) => entry.statusLabel === 'Ready' || entry.statusLabel === 'Scheduled').length;
    const needsApprovalCount = queueItems.filter((entry) => entry.statusLabel === 'Needs approval').length;
    return { readyCount, needsApprovalCount, gapCount: coverageSummary.gaps.length };
  }, [queueItems, coverageSummary.gaps.length]);

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

  return (
    <div className="space-y-6">
      {autopilotRunIdFilter && (
        <Button variant="ghost" size="sm" className="w-fit gap-2" onClick={() => navigate('/home')}>
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Button>
      )}
      <PageHeader title="Content Pipeline" description="Manage upcoming posts, suggestions, and content gaps." />
      <Tabs value={topLevelTab} onValueChange={handleTopLevelTabChange}>
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="library_uploads">Library & Uploads</TabsTrigger>
        </TabsList>
      </Tabs>

      {topLevelTab === 'queue' && (
        <>
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium">Pulse prepared your week</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="px-2 py-1">{headerSummary.readyCount} ready</Badge>
                <Badge variant="outline" className="px-2 py-1 border-amber-500/40 text-amber-700 dark:text-amber-300">{headerSummary.needsApprovalCount} need approval</Badge>
                <Badge variant="outline" className="px-2 py-1">{headerSummary.gapCount} gaps</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium">Coverage: {coverageSummary.coveredDaysCount} / 7 days</p>
              {coverageSummary.missingDayNames.length > 0 ? (
                <p className="text-xs text-muted-foreground">Missing: {coverageSummary.missingDayNames.join(', ')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">All 7 days have content lined up.</p>
              )}
              {coverageSummary.gaps.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {coverageSummary.gaps.map((gap) => (
                    <Badge key={gap} variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                      {gap}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {([
              { key: 'needsApproval', title: 'Needs approval', entries: queueSections.needsApproval, tone: 'border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/10' },
              { key: 'readyScheduled', title: 'Scheduled / Ready', entries: queueSections.readyScheduled, tone: '' },
            ] as const).map((section) => (
              <Card key={section.key} className={section.tone}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{section.title}</p>
                    <Badge variant="outline">{section.entries.length}</Badge>
                  </div>
                  {section.entries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing here right now.</p>
                  ) : (
                    <div className="space-y-3">
                      {section.entries.map(({ item, statusLabel, queueTime }) => {
                        const displayImageUrl = getDisplayImageUrl(item);
                        const sourceLabel = getSourceLabel(item);
                        return (
                          <div key={buildItemKey(item)} className="flex flex-col md:flex-row gap-3 rounded-lg border p-3">
                            <MediaImage
                              src={item.thumbnail_url || displayImageUrl}
                              fallbackSrc={displayImageUrl}
                              alt={item.title || 'Queue preview'}
                              containerClassName="h-20 w-full md:w-28 shrink-0 rounded-md"
                              aspectClassName=""
                              className="h-full w-full object-cover"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusLabel === 'Needs approval' ? 'secondary' : statusLabel === 'Scheduled' ? 'default' : 'outline'}>{statusLabel}</Badge>
                                <Badge variant="outline">{sourceLabel}</Badge>
                                <Badge variant={getPerformanceFeedbackVariant(getPostPerformanceLabel({
                                  id: item.id,
                                  title: item.title,
                                  caption: item.caption_draft || item.caption_final,
                                  scheduledFor: item.scheduled_for,
                                  reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
                                }, performanceInput))}>
                                  {getPostPerformanceLabel({
                                    id: item.id,
                                    title: item.title,
                                    caption: item.caption_draft || item.caption_final,
                                    scheduledFor: item.scheduled_for,
                                    reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
                                  }, performanceInput)}
                                </Badge>
                                <p className="text-xs text-muted-foreground">{queueTime ? format(new Date(queueTime), 'EEE, MMM d · h:mm a') : 'Unscheduled'}</p>
                              </div>
                              <p className="text-sm font-medium line-clamp-1">{item.title || 'Untitled post'}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{item.caption_draft || item.caption_final || 'Add caption details to finish this post.'}</p>
                              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Why Pulse created this</p>
                                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                  {generateQueueExplanation(item, coverageSummary.gaps).map((point) => (
                                    <li key={point} className="text-xs text-muted-foreground">{point}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => approveItem(item)} disabled={statusLabel === 'Scheduled'}>Approve</Button>
                                <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                                <Button size="sm" variant="outline" onClick={() => setScheduleTarget(item)}>Reschedule</Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {topLevelTab === 'suggestions' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Suggestions</p>
              <Badge variant="outline">{queueSections.ideas.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Pulse recommendations that are not yet part of your active queue.</p>
            {queueSections.ideas.length === 0 ? (
              <p className="text-xs text-muted-foreground">No suggestions right now.</p>
            ) : (
              <div className="space-y-3">
                {queueSections.ideas.map(({ item, statusLabel, queueTime }) => {
                  const displayImageUrl = getDisplayImageUrl(item);
                  const sourceLabel = getSourceLabel(item);
                  return (
                    <div key={buildItemKey(item)} className="flex flex-col md:flex-row gap-3 rounded-lg border p-3">
                      <MediaImage
                        src={item.thumbnail_url || displayImageUrl}
                        fallbackSrc={displayImageUrl}
                        alt={item.title || 'Suggestion preview'}
                        containerClassName="h-20 w-full md:w-28 shrink-0 rounded-md"
                        aspectClassName=""
                        className="h-full w-full object-cover"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusLabel === 'Needs approval' ? 'secondary' : 'outline'}>{statusLabel}</Badge>
                          <Badge variant="outline">{sourceLabel}</Badge>
                          <Badge variant={getPerformanceFeedbackVariant(getPostPerformanceLabel({
                            id: item.id,
                            title: item.title,
                            caption: item.caption_draft || item.caption_final,
                            scheduledFor: item.scheduled_for,
                            reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
                          }, performanceInput))}>
                            {getPostPerformanceLabel({
                              id: item.id,
                              title: item.title,
                              caption: item.caption_draft || item.caption_final,
                              scheduledFor: item.scheduled_for,
                              reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
                            }, performanceInput)}
                          </Badge>
                          <p className="text-xs text-muted-foreground">{queueTime ? format(new Date(queueTime), 'EEE, MMM d · h:mm a') : 'Unscheduled'}</p>
                        </div>
                        <p className="text-sm font-medium line-clamp-1">{item.title || 'Untitled suggestion'}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.caption_draft || item.caption_final || 'Add caption details to finish this suggestion.'}</p>
                        <div className="rounded-md bg-muted/30 px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Why Pulse created this</p>
                          <ul className="mt-1 list-disc pl-4 space-y-0.5">
                            {generateQueueExplanation(item, coverageSummary.gaps).map((point) => (
                              <li key={point} className="text-xs text-muted-foreground">{point}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => approveItem(item)} disabled={statusLabel === 'Scheduled'}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => setScheduleTarget(item)}>Schedule</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {topLevelTab === 'library_uploads' && (
        <>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Library & Uploads</p>
                  <p className="text-xs text-muted-foreground">Browse assets, uploads, and historical content.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant={view === 'card' ? 'default' : 'outline'} size="sm" onClick={() => setView('card')}><Layers className="w-4 h-4 mr-1" />Cards</Button>
                  <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}><List className="w-4 h-4 mr-1" />List</Button>
                </div>
              </div>

              <Tabs value={libraryTab} onValueChange={(v) => setLibraryTab(v as LibraryTab)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="ready">Ready</TabsTrigger>
                  <TabsTrigger value="pulse_suggested">Pulse Suggested</TabsTrigger>
                  <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                  <TabsTrigger value="archived">Archived</TabsTrigger>
                </TabsList>
              </Tabs>

              {libraryTab !== 'archived' && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground mr-1">Inventory filter:</p>
                  {([
                    { value: 'all', label: 'All inventory' },
                    { value: 'ready_to_post', label: 'Ready to Post' },
                    { value: 'needs_image', label: 'Needs Image' },
                    { value: 'needs_caption', label: 'Needs Caption' },
                  ] as const).map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={inventoryFilter === option.value ? 'default' : 'outline'}
                      onClick={() => setInventoryFilter(option.value)}
                      className="h-8"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selected.size > 0 && (
            <div className="rounded-lg border p-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground mr-2">{selected.size} selected</p>
              <Button size="sm" variant="outline" onClick={() => updateMany(Array.from(selected), { status: 'archived' })}><Archive className="w-4 h-4 mr-1" />Archive</Button>
              <Button size="sm" variant="destructive" onClick={() => Promise.all(Array.from(selected).map(handleDelete)).then(() => setSelected(new Set()))}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : visibleItems.length === 0 ? (
            <EmptyState icon={Sparkles} title="No content items yet" description="Pulse will prepare suggestions as activity comes in. You can also upload photos to start the queue." />
          ) : view === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((item) => {
            const displayImageUrl = getDisplayImageUrl(item);
            const hasAsset = !!displayImageUrl;
            const readiness = getReadinessState(item);
            const readinessBadge = getReadinessBadge(readiness);
            const autopilotSource = getAutopilotSourceLabel(item);

            return (
              <Card key={buildItemKey(item)} className="overflow-hidden">
                {hasAsset ? (
                  <button
                    type="button"
                    className="group/image relative block w-full h-40 bg-muted cursor-pointer overflow-hidden"
                    onClick={() => openPreview(item)}
                    aria-label={`Preview ${item.title || 'content image'}`}
                  >
                    <img
                      src={displayImageUrl!}
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
                    <p className="text-sm font-medium">No asset yet</p>
                    <p className="text-xs text-muted-foreground">Add an image to make this post-ready.</p>
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
                    <Badge variant={readinessBadge.variant}>{readinessBadge.label}</Badge>
                    <Badge variant="outline">{getSourceLabel(item)}</Badge>
                    <Badge variant={getPerformanceFeedbackVariant(getPostPerformanceLabel({
                      id: item.id,
                      title: item.title,
                      caption: item.caption_draft || item.caption_final,
                      scheduledFor: item.scheduled_for,
                      reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
                    }, performanceInput))}>
                      {getPostPerformanceLabel({
                        id: item.id,
                        title: item.title,
                        caption: item.caption_draft || item.caption_final,
                        scheduledFor: item.scheduled_for,
                        reused: (item.badges || []).some((badge) => badge.toLowerCase().includes('reuse')),
                      }, performanceInput)}
                    </Badge>
                    {item.source === 'autopilot' && <Badge variant="secondary">Needs approval</Badge>}
                    {item.run_type && <Badge variant="outline">{item.run_type.replace('_', ' ')}</Badge>}
                    {item.origin === 'content_asset' && <Badge variant="outline">Asset</Badge>}
                  </div>

                  {autopilotSource && (
                    <p className="text-xs text-muted-foreground">{autopilotSource}</p>
                  )}

                  {item.caption_draft && <p className="text-sm line-clamp-3">{item.caption_draft}</p>}

                  {item.origin === 'content_item' && !hasAsset && item.asset_type && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-100/40 p-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">Asset expected ({item.asset_type}) but missing.</p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {readiness === 'ready_to_post' && (
                      <>
                        {getCalendarSendEligibility(item).ok ? (
                          <Button size="sm" className="w-full" onClick={() => handleSendToCalendar(item)}>
                            <CalendarDays className="w-4 h-4 mr-1" />Send to Calendar
                          </Button>
                        ) : (
                          <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-100/40 p-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800">{(getCalendarSendEligibility(item) as any).reason}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-[1fr_auto] gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                            <Edit3 className="w-4 h-4 mr-1" />Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="More actions">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => updateMany([item.id], { status: 'archived' })}>
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
                      </>
                    )}

                    {readiness === 'needs_image' && (
                      <>
                        <Button size="sm" className="w-full" onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}&action=generate`)}>
                          <Wand2 className="w-4 h-4 mr-1" />Generate Image
                        </Button>
                        <div className="grid grid-cols-[1fr_auto] gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                            <Edit3 className="w-4 h-4 mr-1" />Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="More actions">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openAttachImagePicker(item)}>
                                <Link2 className="w-4 h-4 mr-2" />Attach Image
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}`)}>
                                <Eye className="w-4 h-4 mr-2" />Open in Pro Photo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/studio/pro-photo?contentItemId=${item.id}&action=regenerate`)}>
                                <RefreshCw className="w-4 h-4 mr-2" />Regenerate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(item)}>
                                <Edit3 className="w-4 h-4 mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateMany([item.id], { status: 'archived' })}>
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
                      </>
                    )}

                    {readiness === 'needs_caption' && (
                      <>
                        <Button size="sm" className="w-full" onClick={() => openEdit(item)}>
                          <Edit3 className="w-4 h-4 mr-1" />Write Caption
                        </Button>
                        <div className="grid grid-cols-[1fr_auto] gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                            <Edit3 className="w-4 h-4 mr-1" />Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="More actions">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => updateMany([item.id], { status: 'archived' })}>
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
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
          ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_1fr_140px_140px] gap-2 p-3 text-xs font-medium text-muted-foreground border-b">
            <div />
            <div>Title</div>
            <div>Readiness</div>
            <div>Source</div>
            <div>Next action</div>
          </div>
          {visibleItems.map((item) => {
            const displayImageUrl = getDisplayImageUrl(item);
            const readiness = getReadinessState(item);
            const readinessBadge = getReadinessBadge(readiness);
            return (
              <div key={buildItemKey(item)} className="grid grid-cols-[32px_1fr_1fr_140px_140px] gap-2 p-3 items-center border-b last:border-b-0 text-sm">
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
                <Badge variant={readinessBadge.variant} className="w-fit">{readinessBadge.label}</Badge>
                <Badge variant="outline" className="w-fit">{getSourceLabel(item)}</Badge>
                <span className="text-xs text-muted-foreground">{getNextActionLabel(readiness)}</span>
              </div>
            );
          })}
        </div>
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
            <DialogTitle>Attach Existing Image</DialogTitle>
            <DialogDescription>
              Choose an image to instantly attach to “{attachTarget?.title || 'Untitled'}”.
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
              <p className="text-sm text-muted-foreground py-8 text-center">No venue images found to attach.</p>
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

function getQueueStatusLabel(item: LibraryItem, readiness: ReadinessState): 'Needs approval' | 'Ready' | 'Scheduled' {
  if (item.status === 'scheduled' && item.scheduled_for) return 'Scheduled';
  if (item.source === 'autopilot' && !['approved', 'scheduled', 'published'].includes(item.status)) return 'Needs approval';
  if (readiness === 'ready_to_post') return 'Ready';
  return 'Needs approval';
}

function getNextActionLabel(readiness: ReadinessState): string {
  if (readiness === 'ready_to_post') return 'Send to Calendar';
  if (readiness === 'needs_image') return 'Generate or attach image';
  return 'Write or generate caption';
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

function getPerformanceFeedbackVariant(label: 'Performing well' | 'Average' | 'Needs improvement'): 'default' | 'secondary' | 'destructive' {
  if (label === 'Performing well') return 'default';
  if (label === 'Needs improvement') return 'destructive';
  return 'secondary';
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
