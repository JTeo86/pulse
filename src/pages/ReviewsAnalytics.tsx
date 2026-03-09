import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Star, RefreshCw, FileText, MessageSquare, Settings2,
  Search, Edit2, Power, PowerOff, Trash2, HelpCircle,
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown, ChevronRight,
  ExternalLink, Link2, ShieldAlert, Copy, ThumbsUp, ThumbsDown,
  Archive, Send, Bot, Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────
interface ReviewSource {
  id: string;
  venue_id: string;
  source: string;
  external_id: string;
  is_enabled: boolean;
  display_name: string | null;
  external_id_kind: string | null;
  external_domain: string | null;
  created_at: string;
  updated_at: string;
  last_ingested_at: string | null;
  last_fetch_status: string | null;
  last_fetch_count: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_response_meta: Record<string, unknown> | null;
}

interface IngestionRun {
  id: string;
  venue_id: string;
  source_id: string | null;
  status: string;
  fetched_count: number;
  error_message: string | null;
  raw_meta: Record<string, unknown> | null;
  created_at: string;
}

interface SourceResult {
  source_id: string;
  source_type: string;
  status: 'success' | 'warning' | 'failed';
  fetched_count: number;
  error_code: string | null;
  error_message: string | null;
  response_meta: Record<string, unknown>;
}

interface IngestionResult {
  success: boolean;
  fetched_count: number;
  warnings: string[];
  errors: string[];
  provider_meta: Record<string, unknown>;
  source_results: SourceResult[];
}

interface ResponseTask {
  id: string;
  venue_id: string;
  review_id: string;
  source: string;
  review_date: string | null;
  rating: number | null;
  author_name: string | null;
  review_text: string | null;
  status: string;
  ai_reason: string | null;
  ai_priority: string | null;
  draft_response: string | null;
  final_response: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  post_status: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function extractGoogleId(url: string): { id: string; kind: string } | null {
  const placeMatch = url.match(/[?&]place_id=([^&]+)/);
  if (placeMatch) return { id: placeMatch[1], kind: 'place_id' };
  const dataMatch = url.match(/data=.*?(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (dataMatch) return { id: dataMatch[1], kind: 'data_id' };
  const cidMatch = url.match(/cid=(\d+)/);
  if (cidMatch) return { id: cidMatch[1], kind: 'data_id' };
  const hexMatch = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (hexMatch) return { id: hexMatch[1], kind: 'data_id' };
  return null;
}

function extractOpenTableInfo(url: string): { rid: string; domain: string } | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!u.hostname.includes('opentable')) return null;
    const pathMatch = u.pathname.match(/^\/(r\/[a-z0-9-]+)/i);
    if (!pathMatch) return null;
    return { rid: pathMatch[1], domain: u.hostname };
  } catch {
    return null;
  }
}

function validateGoogleId(v: string): boolean {
  return v.startsWith('ChIJ') || (v.startsWith('0x') && v.includes(':'));
}

function sourceLabel(source: string): string {
  if (source === 'google' || source === 'google_maps') return 'Google';
  if (source === 'opentable') return 'OpenTable';
  return source;
}

function SourceBadge({ source }: { source: string }) {
  const isGoogle = source === 'google' || source === 'google_maps';
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${isGoogle ? 'border-blue-500/30 text-blue-600 dark:text-blue-400' : 'border-orange-500/30 text-orange-600 dark:text-orange-400'}`}>
      {isGoogle ? '🔍' : '🍽️'} {sourceLabel(source)}
    </Badge>
  );
}

function renderStars(rating: number | null) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'}`}
        />
      ))}
    </div>
  );
}

function formatReviewDate(reviewDate: string | null, createdAt: string): string {
  const dateStr = reviewDate || createdAt;
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return 'Unknown date';
  }
}

const priorityColor: Record<string, string> = {
  P1: 'bg-destructive/10 text-destructive border-destructive/20',
  P2: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  P3: 'bg-muted text-muted-foreground border-border',
};

// ── Source Setup ────────────────────────────────────────────────────────

function SourceCard({
  title, description, source, sourceType, venueId,
  existingSource, onRefresh,
}: {
  title: string;
  description: string;
  source: string;
  sourceType: 'google' | 'opentable';
  venueId: string;
  existingSource: ReviewSource | undefined;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [extractedId, setExtractedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isConnected = !!existingSource;

  const handleExtractGoogle = () => {
    const result = extractGoogleId(urlInput);
    if (result) {
      setInputVal(result.id);
      setExtractedId(result.id);
      toast({ title: 'ID extracted', description: `Found ${result.kind}: ${result.id}` });
    } else {
      toast({ title: 'Could not extract ID', description: 'Paste a Google Maps URL containing a place_id or data_id', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    const val = inputVal.trim();
    if (!val) return;

    if (sourceType === 'google' && !validateGoogleId(val)) {
      toast({ title: 'Invalid Google ID', description: 'Must start with ChIJ… (place_id) or 0x…:0x… (data_id)', variant: 'destructive' });
      return;
    }

    let finalExternalId = val;
    let idKind = val.startsWith('ChIJ') ? 'place_id' : val.startsWith('0x') ? 'data_id' : null;
    let externalDomain: string | null = null;

    if (sourceType === 'opentable') {
      if (val.includes('opentable')) {
        const info = extractOpenTableInfo(val);
        if (!info) {
          toast({ title: 'Invalid OpenTable URL', description: 'URL must contain /r/your-restaurant-slug', variant: 'destructive' });
          return;
        }
        finalExternalId = info.rid;
        externalDomain = info.domain;
        idKind = 'rid';
      } else {
        finalExternalId = val.startsWith('r/') ? val : `r/${val}`;
        idKind = 'rid';
      }
    }

    setSaving(true);
    try {
      if (existingSource) {
        const updatePayload: Record<string, unknown> = {
          external_id: finalExternalId,
          external_id_kind: idKind,
        };
        if (externalDomain) updatePayload.external_domain = externalDomain;
        const { error } = await supabase.from('review_sources').update(updatePayload as any).eq('id', existingSource.id);
        if (error) throw error;
        toast({ title: 'Source updated', description: `${sourceType === 'opentable' ? 'rid' : idKind}: ${finalExternalId}` });
      } else {
        const insertPayload: Record<string, unknown> = {
          venue_id: venueId,
          source,
          external_id: finalExternalId,
          external_id_kind: idKind,
        };
        if (externalDomain) insertPayload.external_domain = externalDomain;
        const { error } = await supabase.from('review_sources').insert(insertPayload as any);
        if (error) throw error;
        toast({ title: 'Source connected', description: `Saved ${sourceType}: ${finalExternalId}` });
      }
      onRefresh();
      setEditing(false);
      setInputVal('');
      setUrlInput('');
      setExtractedId(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!existingSource) return;
    const { error } = await supabase.from('review_sources').update({
      is_enabled: !existingSource.is_enabled,
    }).eq('id', existingSource.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      onRefresh();
    }
  };

  const handleDisconnect = async () => {
    if (!existingSource) return;
    const { error } = await supabase.from('review_sources').update({
      is_enabled: false,
    }).eq('id', existingSource.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Source disabled' });
      onRefresh();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs mt-1">{description}</CardDescription>
          </div>
          {isConnected ? (
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <AlertCircle className="w-3 h-3" /> Not connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && !editing ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">ID:</span>
              <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{existingSource.external_id}</code>
              {existingSource.external_id_kind && (
                <Badge variant="outline" className="text-[9px]">{existingSource.external_id_kind}</Badge>
              )}
            </div>
            {existingSource.external_domain && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Domain:</span>
                <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{existingSource.external_domain}</code>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={existingSource.is_enabled} onCheckedChange={handleToggleEnabled} id={`toggle-${existingSource.id}`} />
              <Label htmlFor={`toggle-${existingSource.id}`} className="text-xs">
                {existingSource.is_enabled ? 'Enabled' : 'Disabled'}
              </Label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEditing(true); setInputVal(existingSource.external_id); }}>
                <Edit2 className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDisconnect}>
                <PowerOff className="w-3 h-3 mr-1" /> Disable
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {sourceType === 'google' && (
              <>
                <div>
                  <Label className="text-xs">Google Maps Place ID or Data ID</Label>
                  <Input
                    placeholder="ChIJ… or 0x…:0x…"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <HelpCircle className="w-3 h-3" />
                    How to find your Google Place ID
                    {helpOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 text-xs text-muted-foreground space-y-2 bg-muted/50 rounded-lg p-3">
                    <p><strong>Option A (easiest):</strong> Paste your Google Maps listing URL below and click "Extract ID".</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://maps.google.com/…"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        className="text-xs"
                      />
                      <Button size="sm" variant="outline" onClick={handleExtractGoogle} className="shrink-0 text-xs">
                        <Link2 className="w-3 h-3 mr-1" /> Extract
                      </Button>
                    </div>
                    <p><strong>Option B:</strong> Use <a href="https://developers.google.com/maps/documentation/places/web-service/place-id-finder" target="_blank" rel="noopener noreferrer" className="text-accent underline">Google Place ID Finder</a> and paste the ChIJ… ID directly.</p>
                    <p><strong>Option C:</strong> If you see a hex ID like <code className="px-1 bg-muted rounded">0x…:0x…</code> in the Maps URL, paste it directly.</p>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

            {sourceType === 'opentable' && (
              <div>
                <Label className="text-xs">OpenTable Restaurant URL</Label>
                <Input
                  placeholder="https://www.opentable.com/r/your-restaurant-slug"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  className="mt-1 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  We use SerpAPI OpenTable Reviews engine — no Apify required.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" disabled={!inputVal.trim() || saving} onClick={handleSave}>
                {saving ? 'Saving…' : existingSource ? 'Save changes' : 'Connect'}
              </Button>
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setInputVal(''); }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewSourcesSetup({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();

  const { data: sources, isLoading } = useQuery({
    queryKey: ['review-sources', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_sources')
        .select('*')
        .eq('venue_id', venueId);
      if (error) throw error;
      return data as unknown as ReviewSource[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['review-sources', venueId] });

  const googleSource = sources?.find(s => s.source === 'google' || s.source === 'google_maps');
  const otSource = sources?.find(s => s.source === 'opentable');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SourceCard
        title="Google Reviews"
        description="Fetch reviews from your Google Maps listing via SerpAPI"
        source="google"
        sourceType="google"
        venueId={venueId}
        existingSource={googleSource}
        onRefresh={refresh}
      />
      <SourceCard
        title="OpenTable Reviews"
        description="Fetch reviews from your OpenTable listing via SerpAPI"
        source="opentable"
        sourceType="opentable"
        venueId={venueId}
        existingSource={otSource}
        onRefresh={refresh}
      />
    </div>
  );
}

// ── Fetch Reviews + Results ─────────────────────────────────────────────

function IngestionPanel({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<IngestionResult | null>(null);

  const { data: lastRuns } = useQuery({
    queryKey: ['ingestion-runs', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_ingestion_runs')
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as IngestionRun[];
    },
  });

  const [historyOpen, setHistoryOpen] = useState(false);

  const ingest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ingest-reviews', {
        body: { venue_id: venueId },
      });
      if (error) throw error;
      return data as IngestionResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['reviews', venueId] });
      queryClient.invalidateQueries({ queryKey: ['ingestion-runs', venueId] });
      if (data.success) {
        toast({ title: `Fetched ${data.fetched_count} reviews` });
      } else {
        toast({ title: 'Ingestion completed with errors', variant: 'destructive' });
      }
    },
    onError: (e) => toast({ title: 'Ingestion failed', description: e.message, variant: 'destructive' }),
  });

  const latestRun = lastRuns?.[0];

  const statusIcon = (status: string) => {
    if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-accent" />;
    if (status === 'error') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Button variant="outline" size="sm" onClick={() => ingest.mutate()} disabled={ingest.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${ingest.isPending ? 'animate-spin' : ''}`} />
          Fetch latest reviews
        </Button>
      </div>

      {result && (
        <Card className={result.success ? 'border-accent/30' : 'border-destructive/30'}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {result.success ? <CheckCircle2 className="w-4 h-4 text-accent" /> : <XCircle className="w-4 h-4 text-destructive" />}
              <span className="text-sm font-medium">
                Fetched: {result.fetched_count} reviews
              </span>
            </div>
            {result.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-yellow-500">Warnings:</p>
                {result.warnings.map((w, i) => <p key={i} className="text-xs text-muted-foreground">• {w}</p>)}
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">Errors:</p>
                {result.errors.map((e, i) => (
                  <div key={i}>
                   <p className="text-xs text-muted-foreground">• {e}</p>
                    {e.toLowerCase().includes('401') && (
                      <p className="text-[11px] text-yellow-600 bg-yellow-500/10 rounded px-2 py-1 mt-1">
                        💡 This usually means the runtime is not using the same key you saved in Platform Admin. Go to Platform Admin → Integrations and use "Test SerpAPI Key" to confirm the key the runtime actually reads.
                      </p>
                    )}
                     {e.toLowerCase().includes('missing rid') && (
                      <p className="text-[11px] text-yellow-600 bg-yellow-500/10 rounded px-2 py-1 mt-1">
                         💡 Go to Sources Setup → OpenTable, paste your OpenTable restaurant URL (e.g. opentable.co.uk/r/your-restaurant), and save to extract the rid.
                       </p>
                     )}
                     {(e.toLowerCase().includes("hasn't returned any results") || e.toLowerCase().includes('no results')) && (
                      <p className="text-[11px] text-yellow-600 bg-yellow-500/10 rounded px-2 py-1 mt-1">
                         💡 Check you're using the correct OpenTable domain (e.g., .co.uk vs .com). Re-paste your full OpenTable URL in Sources Setup.
                       </p>
                     )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {latestRun && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Last run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {statusIcon(latestRun.status)}
              <span className="capitalize">{latestRun.status}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">{latestRun.fetched_count} fetched</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{format(new Date(latestRun.created_at), 'MMM d, HH:mm')}</span>
            </div>
            {latestRun.error_message && (
              <p className="text-xs text-destructive bg-destructive/5 rounded p-2">{latestRun.error_message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {lastRuns && lastRuns.length > 1 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Clock className="w-3 h-3" />
            View history ({lastRuns.length} runs)
            {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1.5">
            {lastRuns.map(run => (
              <div key={run.id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
                {statusIcon(run.status)}
                <span className="capitalize min-w-[50px]">{run.status}</span>
                <span className="text-muted-foreground">{run.fetched_count} fetched</span>
                <span className="text-muted-foreground ml-auto">{format(new Date(run.created_at), 'MMM d, HH:mm')}</span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ── Review Feed (improved with source labels + dates) ───────────────────

function ReviewFeed({ venueId }: { venueId: string }) {
  const [search, setSearch] = useState('');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['reviews', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('venue_id', venueId)
        .order('review_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const filtered = reviews?.filter(r =>
    !search || r.review_text?.toLowerCase().includes(search.toLowerCase()) ||
    r.author_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search reviews..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading reviews...</div>
      ) : !filtered?.length ? (
        <div className="text-center py-8 text-muted-foreground">No reviews yet. Set up sources and fetch reviews.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.author_name || 'Anonymous'}</span>
                      {renderStars(r.rating)}
                      <SourceBadge source={r.source} />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{r.review_text || 'No text'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatReviewDate(r.review_date, r.created_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Needs Response Tab ─────────────────────────────────────────────────

function ResponseWriterModal({
  task,
  open,
  onClose,
  onDraftSaved,
}: {
  task: ResponseTask;
  open: boolean;
  onClose: () => void;
  onDraftSaved: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [strategy, setStrategy] = useState('neutral');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(task.draft_response || '');

  const strategies = [
    { key: 'apologise', label: 'Apologise + explain', icon: '🙏' },
    { key: 'resolution', label: 'Offer resolution (offline)', icon: '📞' },
    { key: 'defend', label: 'Correct misinformation', icon: '📋' },
    { key: 'thank', label: 'Thank + invite back', icon: '💚' },
    { key: 'neutral', label: 'Neutral / compliance-safe', icon: '🛡️' },
  ];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-review-response-draft', {
        body: { task_id: task.id, investigation_notes: notes, strategy },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft(data.draft);
      toast({ title: 'Draft generated' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    try {
      const { error } = await supabase
        .from('review_response_tasks' as any)
        .update({
          draft_response: draft,
          final_response: draft,
          status: 'responded',
          approved_at: new Date().toISOString(),
        } as any)
        .eq('id', task.id);
      if (error) throw error;
      toast({ title: 'Response approved' });
      onDraftSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" /> AI Response Writer
          </DialogTitle>
          <DialogDescription>
            Generate a brand-safe response for {task.author_name || 'this reviewer'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Review context */}
          <Card className="bg-muted/50">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center gap-2">
                <SourceBadge source={task.source} />
                {renderStars(task.rating)}
                <span className="text-xs text-muted-foreground">{task.author_name}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-4">{task.review_text}</p>
              {task.ai_reason && (
                <p className="text-xs text-yellow-600 mt-1">AI reason: {task.ai_reason}</p>
              )}
            </CardContent>
          </Card>

          {/* Investigation notes */}
          <div>
            <Label className="text-sm font-medium">Investigation / Background</Label>
            <Textarea
              placeholder="What happened / what we found internally (this stays private, never shared publicly)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Strategy selection */}
          <div>
            <Label className="text-sm font-medium">Response strategy</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {strategies.map(s => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={strategy === s.key ? 'default' : 'outline'}
                  onClick={() => setStrategy(s.key)}
                  className="text-xs"
                >
                  {s.icon} {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            <Bot className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate draft response'}
          </Button>

          {/* Draft output */}
          {draft && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Draft response</Label>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={5}
                className="bg-muted/30"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="w-3 h-3" />
                Review carefully before approving. Edit as needed.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!draft}>
            <Copy className="w-3 h-3 mr-1" /> Copy response
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" variant="outline" disabled className="opacity-50">
                    <Send className="w-3 h-3 mr-1" /> Post reply
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[200px]">Auto-posting requires connecting Google Business Profile / OpenTable partner access. Coming soon.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button size="sm" onClick={handleApprove} disabled={!draft}>
            <ThumbsUp className="w-3 h-3 mr-1" /> Approve response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NeedsResponseTab({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'responded' | 'ignored'>('pending');
  const [writerTask, setWriterTask] = useState<ResponseTask | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['response-tasks', venueId, filter],
    queryFn: async () => {
      let query = supabase
        .from('review_response_tasks' as any)
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      } else if (filter === 'responded') {
        query = query.eq('status', 'responded');
      } else {
        query = query.in('status', ['ignored', 'archived']);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as unknown as ResponseTask[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['response-tasks', venueId] });

  const updateStatus = async (taskId: string, status: string) => {
    const { error } = await supabase
      .from('review_response_tasks' as any)
      .update({ status } as any)
      .eq('id', taskId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Marked as ${status}` });
      refresh();
    }
  };

  const generateTriage = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const weekStart = format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const { data, error } = await supabase.functions.invoke('generate-review-response-tasks', {
        body: { venue_id: venueId, week_start: weekStart, week_end: weekEnd },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      refresh();
      toast({ title: `AI triage complete`, description: `${data.tasks_created || 0} tasks created` });
    },
    onError: (e) => toast({ title: 'Triage failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(['pending', 'responded', 'ignored'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="text-xs capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => generateTriage.mutate()} disabled={generateTriage.isPending}>
          <Bot className={`w-4 h-4 mr-1 ${generateTriage.isPending ? 'animate-spin' : ''}`} />
          Run AI triage
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !tasks?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {filter === 'pending'
              ? 'No reviews need a response right now. Click "Run AI triage" to analyse recent reviews.'
              : `No ${filter} tasks.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <Card key={task.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SourceBadge source={task.source} />
                      {renderStars(task.rating)}
                      <span className="font-medium text-sm">{task.author_name || 'Anonymous'}</span>
                      {task.ai_priority && (
                        <Badge variant="outline" className={`text-[10px] ${priorityColor[task.ai_priority] || ''}`}>
                          {task.ai_priority}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{task.review_text || 'No text'}</p>
                    {task.ai_reason && (
                      <p className="text-xs text-yellow-600 bg-yellow-500/5 rounded px-2 py-1">
                        <Bot className="w-3 h-3 inline mr-1" />
                        {task.ai_reason}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatReviewDate(task.review_date, task.created_at)}
                  </span>
                </div>

                {task.final_response && (
                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-accent mb-1">Approved response:</p>
                    <p className="text-sm">{task.final_response}</p>
                  </div>
                )}

                {filter === 'pending' && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => setWriterTask(task)}>
                      <Edit2 className="w-3 h-3 mr-1" /> Write response
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(task.id, 'ignored')}>
                      <ThumbsDown className="w-3 h-3 mr-1" /> Ignore
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'archived')}>
                      <Archive className="w-3 h-3 mr-1" /> Archive
                    </Button>
                  </div>
                )}

                {filter === 'responded' && task.final_response && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      navigator.clipboard.writeText(task.final_response!);
                      toast({ title: 'Copied' });
                    }}>
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled className="opacity-50">
                              <Send className="w-3 h-3 mr-1" /> Post
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Auto-posting coming soon.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

                {filter === 'ignored' && (
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'archived')}>
                    <Archive className="w-3 h-3 mr-1" /> Archive
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {writerTask && (
        <ResponseWriterModal
          task={writerTask}
          open={!!writerTask}
          onClose={() => setWriterTask(null)}
          onDraftSaved={refresh}
        />
      )}
    </div>
  );
}

// ── Automation Status Card ──────────────────────────────────────────────

function AutomationStatusCard({ venueId }: { venueId: string }) {
  const { data: lastRun } = useQuery({
    queryKey: ['automation-runs', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_automation_runs' as any)
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  return (
    <Card className="bg-muted/30 border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">Weekly Automation</span>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>⏰ Runs every Monday at 08:00 (venue local time)</p>
          <p>📋 Auto-fetches reviews → generates report → triages responses</p>
          {lastRun ? (
            <p className="flex items-center gap-1">
              {lastRun.status === 'success' ? (
                <CheckCircle2 className="w-3 h-3 text-accent" />
              ) : (
                <AlertCircle className="w-3 h-3 text-yellow-500" />
              )}
              Last automated run: {format(new Date(lastRun.created_at), 'MMM d, yyyy HH:mm')}
              {lastRun.steps_completed && ` (${(lastRun.steps_completed as string[]).join(', ')})`}
            </p>
          ) : (
            <p>No automated runs yet. First run will happen next Monday.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Weekly Report ───────────────────────────────────────────────────────

function WeeklyReport({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const now = new Date();
  const lastWeekStart = format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const lastWeekEnd = format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: report, isLoading } = useQuery({
    queryKey: ['weekly-report', venueId, lastWeekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_review_reports')
        .select('*')
        .eq('venue_id', venueId)
        .order('week_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-weekly-review-report', {
        body: { venue_id: venueId, week_start: lastWeekStart, week_end: lastWeekEnd },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', venueId] });
      toast({ title: 'Report generated' });
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const actionItems = (report?.action_items as any) || {};
  const stats = (report?.stats as any) || {};
  const replyTemplates = (report?.reply_templates as any[]) || [];

  return (
    <div className="space-y-6">
      <AutomationStatusCard venueId={venueId} />

      <div className="flex gap-2 flex-wrap">
        <IngestionPanel venueId={venueId} />
        <Separator />
        <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          <FileText className={`w-4 h-4 mr-2 ${generate.isPending ? 'animate-spin' : ''}`} />
          Generate Report ({lastWeekStart} → {lastWeekEnd})
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading report...</div>
      ) : !report ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No report yet. Fetch reviews first, then generate a report.
          </CardContent>
        </Card>
      ) : (
        <>
          {stats.total_reviews && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold">{stats.total_reviews}</p><p className="text-xs text-muted-foreground">Total Reviews</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold">{stats.avg_rating?.toFixed(1) || '—'}</p><p className="text-xs text-muted-foreground">Avg Rating</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold text-accent">{stats.five_star_count || 0}</p><p className="text-xs text-muted-foreground">5-Star</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold text-destructive">{stats.one_two_star_count || 0}</p><p className="text-xs text-muted-foreground">1-2 Star</p></CardContent></Card>
            </div>
          )}

          {actionItems.headline && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{actionItems.headline}</CardTitle>
                <CardDescription>Week of {report.week_start} to {report.week_end}</CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm prose-invert max-w-none">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{report.summary_md || ''}</div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {actionItems.what_went_well?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-accent">✓ What Went Well</CardTitle></CardHeader>
                <CardContent><ul className="space-y-1.5 text-sm">{actionItems.what_went_well.map((item: string, i: number) => <li key={i} className="text-muted-foreground">• {item}</li>)}</ul></CardContent>
              </Card>
            )}
            {actionItems.what_to_fix?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-destructive">✗ What to Fix</CardTitle></CardHeader>
                <CardContent><ul className="space-y-1.5 text-sm">{actionItems.what_to_fix.map((item: string, i: number) => <li key={i} className="text-muted-foreground">• {item}</li>)}</ul></CardContent>
              </Card>
            )}
          </div>

          {actionItems.items?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Action Items</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {actionItems.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 py-2">
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${priorityColor[item.priority] || ''}`}>{item.priority}</Badge>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{item.team}</Badge>
                      <span className="text-sm text-muted-foreground">{item.action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {replyTemplates.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Reply Templates</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {replyTemplates.map((t: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t.for_review}</p>
                    <p className="text-sm bg-muted/50 rounded-lg p-3">{t.reply}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ReviewsAnalytics() {
  const { currentVenue } = useVenue();

  if (!currentVenue) {
    return <div className="text-center py-12 text-muted-foreground">Select a brand to view reviews.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="Reviews & Feedback"
        description="Aggregate reviews from Google and OpenTable via SerpAPI. Generate AI-powered weekly reports and manage responses."
      />

      <Tabs defaultValue="report" className="space-y-6">
        <TabsList>
          <TabsTrigger value="report" className="gap-2"><FileText className="w-4 h-4" />Weekly Report</TabsTrigger>
          <TabsTrigger value="feed" className="gap-2"><MessageSquare className="w-4 h-4" />Review Feed</TabsTrigger>
          <TabsTrigger value="respond" className="gap-2"><ShieldAlert className="w-4 h-4" />Needs Response</TabsTrigger>
          <TabsTrigger value="setup" className="gap-2"><Settings2 className="w-4 h-4" />Sources Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="report"><WeeklyReport venueId={currentVenue.id} /></TabsContent>
        <TabsContent value="feed"><ReviewFeed venueId={currentVenue.id} /></TabsContent>
        <TabsContent value="respond"><NeedsResponseTab venueId={currentVenue.id} /></TabsContent>
        <TabsContent value="setup"><ReviewSourcesSetup venueId={currentVenue.id} /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
