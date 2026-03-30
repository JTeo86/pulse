import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Archive, CalendarDays, CheckCircle2, Clock3, Edit3, Layers, List, Loader2,
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

interface LibraryItem {
  id: string;
  venue_id: string;
  run_type: 'daily_content' | 'weekly_campaign' | 'review_content' | null;
  status: 'draft' | 'approved' | 'scheduled' | 'published' | 'archived' | 'failed' | 'needs_changes';
  title: string | null;
  caption_draft: string | null;
  caption_final: string | null;
  cta: string | null;
  hashtags: string[] | null;
  content_brief: string | null;
  creative_brief: string | null;
  asset_type: string | null;
  media_master_url: string | null;
  suggested_scheduled_for: string | null;
  scheduled_for: string | null;
  campaign_tag: string | null;
  autopilot_run_id: string | null;
  badges: string[] | null;
  source_plan_publish_item_id: string | null;
  source_plan_title: string | null;
  created_at: string;
}

type LibraryTab = 'all' | 'autopilot' | 'manual' | 'approved' | 'scheduled' | 'published' | 'archived';

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
    const ids = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }, [searchParams]);

  const deriveItemSource = useCallback((item: Partial<LibraryItem>) => {
    if (item.autopilot_run_id || item.run_type) return 'autopilot';
    if (item.source_plan_publish_item_id) return 'planner';
    return 'manual';
  }, []);

  const fetchItems = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);
    const selectCandidates = [
      'id, venue_id, run_type, status, title, caption_draft, caption_final, cta, hashtags, content_brief, creative_brief, asset_type, media_master_url, suggested_scheduled_for, scheduled_for, campaign_tag, autopilot_run_id, badges, source_plan_publish_item_id, source_plan_title, created_at',
      'id, venue_id, run_type, status, title, caption_draft, caption_final, asset_type, media_master_url, suggested_scheduled_for, scheduled_for, autopilot_run_id, source_plan_publish_item_id, source_plan_title, created_at',
      'id, venue_id, status, caption_draft, caption_final, asset_type, media_master_url, scheduled_for, created_at',
    ];

    let loadedData: any[] = [];
    let lastError: any = null;

    for (const selectClause of selectCandidates) {
      const { data, error } = await supabase
        .from('content_items')
        .select(selectClause)
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(250);

      if (!error) {
        loadedData = data || [];
        lastError = null;
        break;
      }

      lastError = error;
      if (error.code !== '42703') break;
    }

    setLoading(false);
    if (lastError) {
      toast({ variant: 'destructive', title: 'Failed to load content library', description: lastError.message });
      return;
    }

    setItems(loadedData as LibraryItem[]);
  }, [currentVenue, toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (autopilotRunIdFilter && item.autopilot_run_id !== autopilotRunIdFilter) return false;
      if (contentItemIdsFilter && !contentItemIdsFilter.has(item.id)) return false;
      const source = deriveItemSource(item);
      if (tab === 'all') return true;
      if (tab === 'autopilot') return source === 'autopilot';
      if (tab === 'manual') return source === 'manual';
      return item.status === tab;
    });
  }, [items, tab, autopilotRunIdFilter, contentItemIdsFilter, deriveItemSource]);

  const aiDrafts = useMemo(() => visibleItems.filter((i) => deriveItemSource(i) === 'autopilot' && i.status === 'draft'), [visibleItems, deriveItemSource]);
  const readyToSchedule = useMemo(() => visibleItems.filter((i) => ['approved', 'draft'].includes(i.status) && !!i.caption_draft), [visibleItems]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const updateMany = async (ids: string[], patch: Partial<LibraryItem>) => {
    if (!ids.length) return;
    const { error } = await supabase.from('content_items').update(patch as any).in('id', ids);
    if (error) {
      toast({ variant: 'destructive', title: 'Bulk update failed', description: error.message });
      return;
    }
    setSelected(new Set());
    fetchItems();
  };

  const handleSendToCalendar = async (item: LibraryItem, forcedDate?: string | null) => {
    const schedule = forcedDate || item.suggested_scheduled_for || item.scheduled_for;
    if (!schedule) {
      setScheduleTarget(item);
      return;
    }

    const patch = {
      status: 'scheduled',
      scheduled_for: schedule,
      caption_final: item.caption_final || item.caption_draft || null,
      source_plan_title: deriveItemSource(item) === 'autopilot' ? 'Library Scheduled (Autopilot)' : 'Library Scheduled',
    };
    const { error } = await supabase.from('content_items').update(patch).eq('id', item.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to send to calendar', description: error.message });
      return;
    }

    toast({ title: 'Sent to calendar', description: 'Item moved to scheduled status.' });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('content_items').delete().eq('id', id);
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
    const { error } = await supabase
      .from('content_items')
      .update({ caption_draft: editedCaption, creative_brief: editedBrief })
      .eq('id', editTarget.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
      return;
    }
    toast({ title: 'Library item updated' });
    setEditTarget(null);
    fetchItems();
  };

  const quickFilters = [
    { label: `Autopilot (${visibleItems.filter(i => deriveItemSource(i) === 'autopilot').length})`, onClick: () => setTab('autopilot') },
    { label: `AI Drafts (${aiDrafts.length})`, onClick: () => setTab('all') },
    { label: `Ready to Schedule (${readyToSchedule.length})`, onClick: () => setTab('approved') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Content Library" description="Inventory-first workflow: draft in Library, execute from Calendar." />

      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map((f) => <Button key={f.label} variant="outline" size="sm" onClick={f.onClick}>{f.label}</Button>)}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as LibraryTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant={view === 'card' ? 'default' : 'outline'} size="sm" onClick={() => setView('card')}><Layers className="w-4 h-4 mr-1" />Cards</Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}><List className="w-4 h-4 mr-1" />List</Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/content/planner')}><CalendarDays className="w-4 h-4 mr-1" />Open Calendar</Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-lg border p-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground mr-2">{selected.size} selected</p>
          <Button size="sm" onClick={() => updateMany(Array.from(selected), { status: 'approved', caption_final: null as any })}><CheckCircle2 className="w-4 h-4 mr-1" />Approve selected</Button>
          <Button size="sm" variant="outline" onClick={() => updateMany(Array.from(selected), { status: 'scheduled' as any })}><CalendarDays className="w-4 h-4 mr-1" />Send selected to calendar</Button>
          <Button size="sm" variant="outline" onClick={() => updateMany(Array.from(selected), { status: 'archived' as any })}><Archive className="w-4 h-4 mr-1" />Archive selected</Button>
          <Button size="sm" variant="destructive" onClick={() => Promise.all(Array.from(selected).map((id) => handleDelete(id))).then(() => setSelected(new Set()))}><Trash2 className="w-4 h-4 mr-1" />Delete selected</Button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : visibleItems.length === 0 ? (
        <EmptyState icon={Sparkles} title="No content items yet" description="Run Autopilot or create manual content to build your Library inventory." />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              {item.media_master_url ? <img src={item.media_master_url} alt="" className="h-40 w-full object-cover" /> : <div className="h-40 bg-muted flex items-center justify-center text-xs text-muted-foreground">No asset yet</div>}
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium text-sm line-clamp-1">{item.title || 'Untitled content item'}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <Checkbox checked={selected.has(item.id)} onCheckedChange={(v) => toggleSelect(item.id, !!v)} />
                </div>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{item.status}</Badge>
                  <Badge variant="outline">{deriveItemSource(item)}</Badge>
                  {item.run_type && <Badge variant="outline">{item.run_type.replace('_', ' ')}</Badge>}
                  {(item.badges || []).slice(0, 2).map((b) => <Badge key={b} variant="outline">{b}</Badge>)}
                </div>

                <p className="text-sm line-clamp-3">{item.caption_draft || item.caption_final || 'No caption yet.'}</p>

                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => supabase.from('content_items').update({ status: 'approved' }).eq('id', item.id).then(fetchItems)}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Edit3 className="w-4 h-4 mr-1" />Edit</Button>
                  <Button size="sm" onClick={() => handleSendToCalendar(item)}><CalendarDays className="w-4 h-4 mr-1" />Send to Calendar</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleSendToCalendar(item, new Date().toISOString())}><Rocket className="w-4 h-4 mr-1" />Schedule now</Button>
                  <Button size="sm" variant="ghost" onClick={() => toast({ title: 'Generate asset brief queued', description: 'Open Pro Photo/Reel from this brief in next step.' })}><PlusCircle className="w-4 h-4 mr-1" />Generate Asset</Button>
                  <Button size="sm" variant="ghost" onClick={() => supabase.from('content_items').update({ status: 'archived' }).eq('id', item.id).then(fetchItems)}><Archive className="w-4 h-4 mr-1" />Archive</Button>
                </div>

                <Button size="sm" variant="destructive" className="w-full" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[32px_1.2fr_1fr_120px_120px] gap-2 p-3 text-xs font-medium text-muted-foreground border-b">
            <div />
            <div>Title</div>
            <div>Caption</div>
            <div>Status</div>
            <div>Source</div>
          </div>
          {visibleItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[32px_1.2fr_1fr_120px_120px] gap-2 p-3 items-center border-b last:border-b-0 text-sm">
              <Checkbox checked={selected.has(item.id)} onCheckedChange={(v) => toggleSelect(item.id, !!v)} />
              <div>{item.title || 'Untitled'}</div>
              <div className="line-clamp-1 text-muted-foreground">{item.caption_draft || item.caption_final || '-'}</div>
              <Badge variant="secondary" className="w-fit">{item.status}</Badge>
              <Badge variant="outline" className="w-fit">{deriveItemSource(item)}</Badge>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!scheduleTarget} onOpenChange={(v) => !v && setScheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick a schedule time</DialogTitle>
            <DialogDescription>This item has no suggested time yet. Pick when to move it into your calendar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Scheduled date & time</Label>
            <Input type="datetime-local" value={scheduleDateTime} onChange={(e) => setScheduleDateTime(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!scheduleTarget || !scheduleDateTime) return;
                handleSendToCalendar(scheduleTarget, new Date(scheduleDateTime).toISOString());
                setScheduleTarget(null);
                setScheduleDateTime('');
              }}
            >
              <Clock3 className="w-4 h-4 mr-1" /> Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit library item</DialogTitle>
            <DialogDescription>Update caption and creative brief before approval/scheduling.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Caption draft</Label>
              <Textarea value={editedCaption} onChange={(e) => setEditedCaption(e.target.value)} className="min-h-32" />
            </div>
            <div className="space-y-1">
              <Label>Creative brief</Label>
              <Textarea value={editedBrief} onChange={(e) => setEditedBrief(e.target.value)} className="min-h-24" />
            </div>
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
