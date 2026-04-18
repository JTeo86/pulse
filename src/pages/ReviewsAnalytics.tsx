import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Star, RefreshCw, FileText, MessageSquare, Settings2,
  Search, Edit2, Power, PowerOff, Trash2, HelpCircle,
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown, ChevronRight,
  ExternalLink, Link2, ShieldAlert, Copy, ThumbsUp, ThumbsDown,
  Archive, Send, Bot, Zap, Activity, Sparkles, TrendingUp,
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
import { format } from 'date-fns';
import { getCompletedReviewWeekRange } from '@/lib/review-weekly-cycle';
import { useMarketOpportunities } from '@/hooks/use-market-opportunities';

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

interface ThemeInsight {
  theme: 'food' | 'service' | 'ambiance' | 'value' | 'other';
  praiseCount: number;
  complaintCount: number;
}

const themeKeywords: Record<ThemeInsight['theme'], string[]> = {
  food: ['food', 'dish', 'menu', 'tasting', 'meal', 'flavor', 'taste', 'dessert', 'cocktail', 'wine', 'drinks'],
  service: ['service', 'staff', 'server', 'host', 'manager', 'wait', 'friendly', 'rude', 'attentive', 'slow'],
  ambiance: ['ambiance', 'atmosphere', 'music', 'lighting', 'decor', 'vibe', 'noise', 'noisy', 'loud', 'quiet'],
  value: ['value', 'price', 'expensive', 'overpriced', 'worth', 'portion', 'bill', 'cost', 'affordable'],
  other: [],
};

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

function classifyTheme(text: string | null): ThemeInsight['theme'] {
  if (!text) return 'other';
  const normalized = text.toLowerCase();
  for (const [theme, keywords] of Object.entries(themeKeywords) as [ThemeInsight['theme'], string[]][]) {
    if (theme === 'other') continue;
    if (keywords.some(keyword => normalized.includes(keyword))) return theme;
  }
  return 'other';
}

function isPositiveReview(review: { rating: number | null; review_text: string | null }) {
  const text = review.review_text?.toLowerCase() || '';
  const positiveWords = ['great', 'amazing', 'excellent', 'love', 'perfect', 'delicious', 'fantastic', 'friendly', 'best'];
  return (review.rating || 0) >= 4 || positiveWords.some(w => text.includes(w));
}

function isNegativeReview(review: { rating: number | null; review_text: string | null }) {
  const text = review.review_text?.toLowerCase() || '';
  const negativeWords = ['bad', 'poor', 'slow', 'rude', 'awful', 'disappoint', 'cold', 'overpriced', 'worst', 'waited'];
  return (review.rating || 0) <= 2 || negativeWords.some(w => text.includes(w));
}

function themeLabel(theme: ThemeInsight['theme']) {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

// ── Source Setup ────────────────────────────────────────────────────────

function SourceStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'never_run') return (
    <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground"><Clock className="w-3 h-3" /> Never Run</Badge>
  );
  if (status === 'success') return (
    <Badge variant="outline" className="text-[10px] gap-1 border-accent/30 text-accent"><CheckCircle2 className="w-3 h-3" /> Healthy</Badge>
  );
  if (status === 'warning') return (
    <Badge variant="outline" className="text-[10px] gap-1 border-yellow-500/30 text-yellow-600"><AlertCircle className="w-3 h-3" /> Warning</Badge>
  );
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive"><XCircle className="w-3 h-3" /> Failed</Badge>
  );
}

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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

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

  const handleTestSource = async () => {
    if (!existingSource) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-review-source', {
        body: { source_id: existingSource.id },
      });
      if (error) throw error;
      setTestResult(data);
      onRefresh();
      if (data.success) {
        toast({ title: 'Source is healthy', description: `${data.review_count} reviews available` });
      } else {
        toast({ title: 'Source test failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Test failed', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
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
          <div className="flex items-center gap-2">
            {isConnected && <SourceStatusBadge status={existingSource.last_fetch_status} />}
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
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && !editing ? (
          <>
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground text-xs w-16 shrink-0">{sourceType === 'opentable' ? 'RID:' : 'ID:'}</span>
                <code className="font-mono text-xs bg-background px-2 py-0.5 rounded break-all">{existingSource.external_id}</code>
                {existingSource.external_id_kind && (
                  <Badge variant="outline" className="text-[9px]">{existingSource.external_id_kind}</Badge>
                )}
              </div>
              {(sourceType === 'opentable' || existingSource.external_domain) && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground text-xs w-16 shrink-0">Domain:</span>
                  <code className="font-mono text-xs bg-background px-2 py-0.5 rounded">
                    {existingSource.external_domain || 'opentable.com (default)'}
                  </code>
                </div>
              )}
              {existingSource.last_ingested_at && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground text-xs w-16 shrink-0">Last run:</span>
                  <span className="text-xs">{format(new Date(existingSource.last_ingested_at), 'MMM d, HH:mm')}</span>
                  <span className="text-xs text-muted-foreground">• {existingSource.last_fetch_count ?? 0} fetched</span>
                </div>
              )}
              {existingSource.last_error_message && existingSource.last_fetch_status !== 'success' && (
                <div className="text-xs text-destructive bg-destructive/5 rounded p-2 mt-1">
                  {existingSource.last_error_code && (
                    <span className="font-mono text-[10px] mr-1">[{existingSource.last_error_code}]</span>
                  )}
                  {existingSource.last_error_message}
                </div>
              )}
            </div>

            {/* Zero-results warning for connected+enabled sources */}
            {existingSource.is_enabled && existingSource.last_fetch_status && existingSource.last_fetch_status !== 'success' && existingSource.last_fetch_status !== 'never_run' && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-xs space-y-2">
                <p className="font-medium text-yellow-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {sourceType === 'opentable' ? 'OpenTable' : 'Google'} is connected but having issues
                </p>
                {sourceType === 'opentable' && (
                  <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Verify the restaurant path (rid) matches your listing</li>
                    <li>Check the domain — UK venues need <code className="px-1 bg-muted rounded">opentable.co.uk</code> not <code className="px-1 bg-muted rounded">opentable.com</code></li>
                    <li>Use "Test Source" below to diagnose</li>
                  </ul>
                )}
                {sourceType === 'google' && (
                  <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Verify the place ID or data ID is correct</li>
                    <li>Use "Test Source" below to diagnose</li>
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={existingSource.is_enabled} onCheckedChange={handleToggleEnabled} id={`toggle-${existingSource.id}`} />
              <Label htmlFor={`toggle-${existingSource.id}`} className="text-xs">
                {existingSource.is_enabled ? 'Enabled' : 'Disabled'}
              </Label>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleTestSource} disabled={testing}>
                <Activity className={`w-3 h-3 mr-1 ${testing ? 'animate-pulse' : ''}`} />
                {testing ? 'Testing…' : 'Test Source'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(true); setInputVal(existingSource.external_id); }}>
                <Edit2 className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDisconnect}>
                <PowerOff className="w-3 h-3 mr-1" /> Disable
              </Button>
            </div>

            {testResult && (
              <Card className={`mt-2 ${testResult.success ? 'border-accent/30' : 'border-destructive/30'}`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-accent" /> : <XCircle className="w-4 h-4 text-destructive" />}
                    <span className="font-medium">
                      {testResult.success ? `Healthy — ${testResult.review_count} reviews available` : 'Test failed'}
                    </span>
                  </div>
                  {testResult.error && (
                    <p className="text-xs text-destructive">{testResult.error}</p>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    ID: {testResult.identifier} {testResult.domain ? `• Domain: ${testResult.domain}` : ''}
                  </div>
                </CardContent>
              </Card>
            )}
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
              <div className="space-y-2">
                <Label className="text-xs">OpenTable Restaurant URL or Path</Label>
                <Input
                  placeholder="https://www.opentable.co.uk/r/your-restaurant-slug"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  className="mt-1 text-sm"
                />
                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground">How this works:</p>
                  <p>Paste your full OpenTable URL. We'll extract the restaurant path and regional domain automatically.</p>
                  <p>Example: <code className="px-1 bg-background rounded">https://www.opentable.co.uk/r/the-ivy-london</code></p>
                  <p>→ Path: <code className="px-1 bg-background rounded">r/the-ivy-london</code> • Domain: <code className="px-1 bg-background rounded">www.opentable.co.uk</code></p>
                  <p className="text-yellow-600">⚠️ Using the wrong domain (e.g. .com instead of .co.uk) will return no results for UK venues.</p>
                </div>
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
      queryClient.invalidateQueries({ queryKey: ['review-sources', venueId] });
      if (data.success) {
        toast({ title: `Fetched ${data.fetched_count} reviews` });
      } else {
        toast({ title: 'Ingestion completed with errors', variant: 'destructive' });
      }
    },
    onError: (e) => toast({ title: 'Ingestion failed', description: e.message, variant: 'destructive' }),
  });

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

      {/* Per-source results breakdown */}
      {result && (
        <div className="space-y-3">
          <Card className={result.success ? 'border-accent/30' : 'border-destructive/30'}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2">
                {result.success ? <CheckCircle2 className="w-4 h-4 text-accent" /> : <XCircle className="w-4 h-4 text-destructive" />}
                <span className="text-sm font-medium">
                  Total: {result.fetched_count} reviews fetched
                </span>
              </div>
            </CardContent>
          </Card>

          {result.source_results?.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {result.source_results.map((sr, i) => (
                <Card key={i} className={sr.status === 'success' ? 'border-accent/20' : sr.status === 'warning' ? 'border-yellow-500/20' : 'border-destructive/20'}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <SourceBadge source={sr.source_type} />
                      <SourceStatusBadge status={sr.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sr.fetched_count} reviews fetched
                    </div>
                    {sr.error_message && (
                      <div className="text-xs text-destructive bg-destructive/5 rounded p-2">
                        {sr.error_code && <span className="font-mono text-[10px] mr-1">[{sr.error_code}]</span>}
                        {sr.error_message}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Sources not in results = not configured */}
          {result.source_results?.length === 0 && result.warnings.length > 0 && (
            <div className="space-y-1">
              {result.warnings.map((w, i) => <p key={i} className="text-xs text-muted-foreground">• {w}</p>)}
            </div>
          )}
        </div>
      )}

      {lastRuns && lastRuns.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Clock className="w-3 h-3" />
            Run history ({lastRuns.length} runs)
            {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1.5">
            {lastRuns.map(run => (
              <div key={run.id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
                {statusIcon(run.status)}
                <span className="capitalize min-w-[50px]">{run.status}</span>
                {run.raw_meta && (run.raw_meta as any).engine && (
                  <SourceBadge source={(run.raw_meta as any).engine === 'google_maps_reviews' ? 'google' : 'opentable'} />
                )}
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

function themeSummaryLine(theme: ThemeInsight, type: 'praise' | 'complaint') {
  if (type === 'praise') {
    if (theme.praiseCount >= 5) return 'consistently praised';
    if (theme.praiseCount >= 3) return 'often praised';
    return 'getting positive mentions';
  }
  if (theme.complaintCount >= 5) return 'frequent concern';
  if (theme.complaintCount >= 3) return 'mixed at busy periods';
  return 'occasional concern';
}

function ReputationWorkflowTab({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const [writerTask, setWriterTask] = useState<ResponseTask | null>(null);
  const { reviewContentSuggestions } = useMarketOpportunities(5);

  const { data: reviews } = useQuery({
    queryKey: ['reviews-workflow', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, review_text, rating, review_date, created_at')
        .eq('venue_id', venueId)
        .order('review_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return data as Array<{ id: string; review_text: string | null; rating: number | null; review_date: string | null; created_at: string }>;
    },
  });

  const { data: pendingTasks } = useQuery({
    queryKey: ['response-tasks-workflow', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_response_tasks' as any)
        .select('*')
        .eq('venue_id', venueId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      return data as unknown as ResponseTask[];
    },
  });

  const refreshWorkflow = () => {
    queryClient.invalidateQueries({ queryKey: ['response-tasks-workflow', venueId] });
    queryClient.invalidateQueries({ queryKey: ['response-tasks', venueId] });
  };

  const updateStatus = async (taskId: string, status: string) => {
    const { error } = await supabase
      .from('review_response_tasks' as any)
      .update({ status } as any)
      .eq('id', taskId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Task marked ${status}` });
    refreshWorkflow();
  };

  const approveDraft = async (task: ResponseTask) => {
    if (!task.draft_response?.trim()) return;
    const { error } = await supabase
      .from('review_response_tasks' as any)
      .update({
        final_response: task.draft_response,
        status: 'responded',
        approved_at: new Date().toISOString(),
      } as any)
      .eq('id', task.id);
    if (error) {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reply approved' });
    refreshWorkflow();
  };

  const recentReviews = (reviews || []).slice(0, 60);
  const themeMap: Record<ThemeInsight['theme'], ThemeInsight> = {
    food: { theme: 'food', praiseCount: 0, complaintCount: 0 },
    service: { theme: 'service', praiseCount: 0, complaintCount: 0 },
    ambiance: { theme: 'ambiance', praiseCount: 0, complaintCount: 0 },
    value: { theme: 'value', praiseCount: 0, complaintCount: 0 },
    other: { theme: 'other', praiseCount: 0, complaintCount: 0 },
  };

  recentReviews.forEach(review => {
    const theme = classifyTheme(review.review_text);
    if (isPositiveReview(review)) themeMap[theme].praiseCount += 1;
    if (isNegativeReview(review)) themeMap[theme].complaintCount += 1;
  });

  const themeInsights = Object.values(themeMap).sort((a, b) => (b.praiseCount + b.complaintCount) - (a.praiseCount + a.complaintCount));
  const topPraiseThemes = [...themeInsights].sort((a, b) => b.praiseCount - a.praiseCount).filter(t => t.praiseCount > 0).slice(0, 3);
  const recurringIssues = [...themeInsights].sort((a, b) => b.complaintCount - a.complaintCount).filter(t => t.complaintCount >= 2).slice(0, 3);

  const tasks = pendingTasks || [];
  const urgentNegatives = tasks.filter(task => (task.rating || 0) <= 2 || task.ai_priority === 'P1' || (task.review_text?.toLowerCase().includes('wait') ?? false));
  const readyToApprove = tasks.filter(task => !!task.draft_response?.trim());
  const urgentQueue = [...tasks]
    .filter(task => (task.rating || 0) <= 2 || task.ai_priority === 'P1' || !!task.draft_response?.trim())
    .sort((a, b) => {
      const score = (task: ResponseTask) => ((task.rating || 5) <= 2 ? 4 : 0) + (task.ai_priority === 'P1' ? 3 : task.ai_priority === 'P2' ? 2 : 0) + (task.draft_response ? 2 : 0);
      return score(b) - score(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 8);
  const draftQueue = [...readyToApprove]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  const topPositiveTheme = topPraiseThemes[0];
  const topRecurringIssue = recurringIssues[0];

  return (
    <div className="space-y-4">
      <Card className="border-accent/20 bg-accent/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Pulse reviewed your latest feedback
          </CardTitle>
          <CardDescription>Your weekly reputation workflow is ready.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Urgent replies</p>
              <p className="text-2xl font-semibold text-destructive">{urgentNegatives.length}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Draft replies ready</p>
              <p className="text-2xl font-semibold">{readyToApprove.length}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Recurring issues detected</p>
              <p className="text-2xl font-semibold">{recurringIssues.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reputation snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Guests are loving:</span> {topPositiveTheme ? `${themeLabel(topPositiveTheme.theme)} (${topPositiveTheme.praiseCount} positive mentions)` : 'No clear positive theme yet this week.'}</p>
          <p><span className="text-muted-foreground">Recurring issue:</span> {topRecurringIssue ? `${themeLabel(topRecurringIssue.theme)} (${topRecurringIssue.complaintCount} complaint mentions)` : 'No repeating complaint pattern detected.'}</p>
          <p><span className="text-muted-foreground">Reviews needing urgent attention:</span> {urgentNegatives.length}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Urgent reply queue</CardTitle>
          <CardDescription>Low ratings, recent negatives, and draft-ready items first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {urgentQueue.length === 0 ? (
            <p className="text-xs text-muted-foreground">No urgent replies right now.</p>
          ) : urgentQueue.map(task => (
            <div key={task.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SourceBadge source={task.source} />
                    {renderStars(task.rating)}
                    {task.ai_priority && <Badge variant="outline" className={`text-[10px] ${priorityColor[task.ai_priority] || ''}`}>{task.ai_priority}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{task.author_name || 'Anonymous'} • {formatReviewDate(task.review_date, task.created_at)}</p>
                </div>
                {task.draft_response && <Badge className="text-[10px]">Draft ready</Badge>}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{task.review_text || 'No review text available.'}</p>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">AI drafted reply</p>
                <p className="text-xs line-clamp-2">{task.draft_response || 'No draft yet — click Edit to generate one.'}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {task.draft_response ? (
                  <Button size="sm" onClick={() => approveDraft(task)}><ThumbsUp className="w-3 h-3 mr-1" />Approve</Button>
                ) : (
                  <Button size="sm" onClick={() => setWriterTask(task)}><Edit2 className="w-3 h-3 mr-1" />Write draft</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setWriterTask(task)}><Edit2 className="w-3 h-3 mr-1" />Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'ignored')}><ThumbsDown className="w-3 h-3 mr-1" />Skip</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Draft reply queue</CardTitle>
          <CardDescription>Newest drafted replies awaiting approval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {draftQueue.length === 0 ? (
            <p className="text-xs text-muted-foreground">No drafts waiting for approval.</p>
          ) : draftQueue.map(task => (
            <div key={task.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Awaiting approval</Badge>
                  <SourceBadge source={task.source} />
                  {renderStars(task.rating)}
                </div>
                <span className="text-xs text-muted-foreground">{formatReviewDate(task.review_date, task.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{task.review_text}</p>
              <p className="text-sm line-clamp-2">{task.draft_response}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approveDraft(task)}><ThumbsUp className="w-3 h-3 mr-1" />Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setWriterTask(task)}><Edit2 className="w-3 h-3 mr-1" />Edit</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">What guests are saying</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {(['food', 'service', 'ambiance', 'value', 'other'] as ThemeInsight['theme'][]).map(themeKey => {
            const theme = themeMap[themeKey];
            const hasData = theme.praiseCount + theme.complaintCount > 0;
            const summary = theme.complaintCount > theme.praiseCount
              ? themeSummaryLine(theme, 'complaint')
              : themeSummaryLine(theme, 'praise');
            return (
              <div key={theme.theme} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{themeLabel(theme.theme)}</p>
                <p className="text-xs text-muted-foreground mt-1">{hasData ? summary : 'No strong signal yet this week.'}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Content opportunities from reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {reviewContentSuggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No strong positive trend yet. Recheck after next review fetch.</p>
          ) : reviewContentSuggestions.map((suggestion, i) => (
            <p key={i} className="text-sm text-muted-foreground">• {suggestion}</p>
          ))}
        </CardContent>
      </Card>

      {writerTask && (
        <ResponseWriterModal
          task={writerTask}
          open={!!writerTask}
          onClose={() => setWriterTask(null)}
          onDraftSaved={refreshWorkflow}
        />
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
  const [tone, setTone] = useState<'auto' | 'warm' | 'firm'>('auto');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(task.draft_response || '');

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-review-response-draft', {
        body: { task_id: task.id, investigation_notes: notes, strategy: tone === 'auto' ? undefined : tone === 'warm' ? 'thank' : 'resolution' },
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

          <div>
            <Label className="text-sm font-medium">Tone (optional)</Label>
            <div className="flex gap-2 mt-2">
              {(['auto', 'warm', 'firm'] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={tone === option ? 'default' : 'outline'}
                  onClick={() => setTone(option)}
                  className="text-xs capitalize"
                >
                  {option === 'auto' ? 'Auto' : option}
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
          <Button size="sm" onClick={handleApprove} disabled={!draft}>
            <ThumbsUp className="w-3 h-3 mr-1" /> Approve response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NeedsResponseTab({ venueId, venueTimezone }: { venueId: string; venueTimezone: string }) {
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
      const cycle = getCompletedReviewWeekRange(new Date(), venueTimezone);
      const { data, error } = await supabase.functions.invoke('generate-review-response-tasks', {
        body: { venue_id: venueId, week_start: cycle.weekStart, week_end: cycle.weekEnd },
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

  const approveDraft = async (task: ResponseTask) => {
    if (!task.draft_response?.trim()) return;
    const { error } = await supabase
      .from('review_response_tasks' as any)
      .update({
        final_response: task.draft_response,
        status: 'responded',
        approved_at: new Date().toISOString(),
      } as any)
      .eq('id', task.id);
    if (error) {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Reply approved', description: 'Moved to responded and ready to post.' });
      refresh();
    }
  };

  const pendingTasks = (tasks || []).filter(t => t.status === 'pending');
  const readyForApproval = pendingTasks.filter(t => !!t.draft_response?.trim());
  const needsDrafting = pendingTasks.filter(t => !t.draft_response?.trim());

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
          {filter === 'pending' && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-accent/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Approve in one sitting</CardTitle>
                  <CardDescription>{readyForApproval.length} drafts are ready for final sign-off.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {readyForApproval.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No drafts ready yet. Use “Write response” to generate drafts first.</p>
                  ) : readyForApproval.map(task => (
                    <div key={task.id} className="rounded-lg border p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {renderStars(task.rating)}
                          <span className="text-xs">{task.author_name || 'Anonymous'}</span>
                        </div>
                        {task.ai_priority && <Badge variant="outline" className={`text-[10px] ${priorityColor[task.ai_priority] || ''}`}>{task.ai_priority}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{task.draft_response}</p>
                      <Button size="sm" className="w-full" onClick={() => approveDraft(task)}>
                        <ThumbsUp className="w-3 h-3 mr-1" /> Quick approve
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Needs drafting now</CardTitle>
                  <CardDescription>{needsDrafting.length} pending reviews still need a draft reply.</CardDescription>
                </CardHeader>
                <CardContent>
                  {needsDrafting.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Great—everything pending already has a draft.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {needsDrafting.slice(0, 6).map(task => (
                        <li key={task.id} className="text-muted-foreground flex items-center justify-between gap-2">
                          <span className="truncate">{task.author_name || 'Anonymous'} • {formatReviewDate(task.review_date, task.created_at)}</span>
                          <Button size="sm" variant="outline" onClick={() => setWriterTask(task)}>
                            Draft
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {tasks.map(task => {
            const isPending = filter === 'pending';
            const statusLabel = isPending ? 'Needs reply' : filter === 'responded' ? 'Completed' : 'Ignored';
            const statusStyle = isPending
              ? 'border-yellow-500/30 text-yellow-700 bg-yellow-500/10'
              : filter === 'responded'
                ? 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10'
                : 'border-muted-foreground/30 text-muted-foreground bg-muted/50';

            return (
              <Card key={task.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {renderStars(task.rating)}
                      <SourceBadge source={task.source} />
                      <Badge variant="outline" className={`text-[10px] ${statusStyle}`}>
                        {statusLabel}
                      </Badge>
                      {task.ai_priority && (
                        <Badge variant="outline" className={`text-[10px] ${priorityColor[task.ai_priority] || ''}`}>
                          {task.ai_priority}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {task.review_text || 'No review text available.'}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {isPending && (
                      <>
                        <Button size="sm" onClick={() => setWriterTask(task)}>
                          <Edit2 className="w-3 h-3 mr-1" /> Write response
                        </Button>
                        {task.draft_response && (
                          <Button size="sm" variant="outline" onClick={() => approveDraft(task)}>
                            <ThumbsUp className="w-3 h-3 mr-1" /> Approve draft
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => updateStatus(task.id, 'ignored')}>
                          <ThumbsDown className="w-3 h-3 mr-1" /> Ignore
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'archived')}>
                          <Archive className="w-3 h-3 mr-1" /> Archive
                        </Button>
                      </>
                    )}

                    {filter === 'responded' && task.final_response && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => {
                          navigator.clipboard.writeText(task.final_response!);
                          toast({ title: 'Copied' });
                        }}>
                          <Copy className="w-3 h-3 mr-1" /> Copy
                        </Button>
                      </>
                    )}

                    {filter === 'ignored' && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(task.id, 'archived')}>
                        <Archive className="w-3 h-3 mr-1" /> Archive
                      </Button>
                    )}
                  </div>

                  <Collapsible defaultOpen={isPending}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between px-3 rounded-b-none">
                          <span className="text-xs font-medium">Full review + AI reply</span>
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 p-3 pt-0">
                        <p className="text-sm whitespace-pre-wrap">{task.review_text || 'No review text available.'}</p>
                        {(task.draft_response || task.final_response) && (
                          <div className="rounded-md border bg-accent/5 p-2.5">
                            <p className="text-xs font-medium mb-1">{isPending ? 'AI suggested reply' : 'Reply'}</p>
                            <p className="text-sm whitespace-pre-wrap">{task.draft_response || task.final_response}</p>
                          </div>
                        )}
                        {isPending && !task.draft_response && (
                          <p className="text-xs text-muted-foreground">No AI draft yet. Click “Write response” to generate one.</p>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>

                  <Collapsible>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between px-3">
                          <span className="text-xs font-medium">Details</span>
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2 px-3 pb-3">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{task.author_name || 'Anonymous'}</span> · {formatReviewDate(task.review_date, task.created_at)}
                        </p>
                        {task.ai_reason && (
                          <p className="text-xs text-yellow-700 bg-yellow-500/5 rounded px-2 py-1">
                            <Bot className="w-3 h-3 inline mr-1" />
                            {task.ai_reason}
                          </p>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
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

function AutomationStatusCard({ venueId, venueTimezone, onOpenSetup }: { venueId: string; venueTimezone: string; onOpenSetup?: () => void }) {
  const queryClient = useQueryClient();
  const cycle = getCompletedReviewWeekRange(new Date(), venueTimezone);

  const { data, isLoading } = useQuery({
    queryKey: ['reviews-health', venueId, cycle.weekStart, cycle.weekEnd],
    queryFn: async () => {
      const [{ data: latestRun }, { data: lastSuccess }, { data: sources }, { count: pendingCount }, { count: draftCount }, { count: fetchedThisWeek }] = await Promise.all([
        supabase.from('review_automation_runs' as any).select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('review_automation_runs' as any).select('*').eq('venue_id', venueId).eq('status', 'success').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('review_sources' as any).select('id, is_enabled').eq('venue_id', venueId),
        supabase.from('review_response_tasks' as any).select('id', { count: 'exact', head: true }).eq('venue_id', venueId).eq('status', 'pending'),
        supabase.from('review_response_tasks' as any).select('id', { count: 'exact', head: true }).eq('venue_id', venueId).eq('status', 'pending').not('draft_response', 'is', null),
        supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('venue_id', venueId).gte('review_date', cycle.weekStart).lte('review_date', `${cycle.weekEnd}T23:59:59Z`),
      ]);

      return {
        latestRun: latestRun as any,
        lastSuccess: lastSuccess as any,
        connectedSources: (sources || []).filter((s: any) => s.is_enabled).length,
        pendingCount: pendingCount || 0,
        draftCount: draftCount || 0,
        fetchedThisWeek: fetchedThisWeek || 0,
      };
    },
  });

  const runWeeklyNow = useMutation({
    mutationFn: async () => {
      const nowIso = new Date().toISOString();
      const { data: runRow, error: runError } = await supabase
        .from('review_automation_runs' as any)
        .upsert({
          venue_id: venueId,
          week_start: cycle.weekStart,
          week_end: cycle.weekEnd,
          scheduled_for: nowIso,
          status: 'running',
          steps_completed: [],
          error_message: null,
        } as any, { onConflict: 'venue_id,week_start' })
        .select('*')
        .single();
      if (runError) throw runError;

      const completedSteps: string[] = [];
      const errors: string[] = [];

      const ingest = await supabase.functions.invoke('ingest-reviews', { body: { venue_id: venueId } });
      if (ingest.error || ingest.data?.error) {
        errors.push(`Ingest failed: ${ingest.error?.message || ingest.data?.error}`);
      } else {
        completedSteps.push('ingest');
      }

      const report = await supabase.functions.invoke('generate-weekly-review-report', {
        body: { venue_id: venueId, week_start: cycle.weekStart, week_end: cycle.weekEnd },
      });
      if (report.error || report.data?.error) {
        errors.push(`Report failed: ${report.error?.message || report.data?.error}`);
      } else {
        completedSteps.push(report.data?.no_reviews ? 'report_no_reviews' : 'report');
      }

      const triage = await supabase.functions.invoke('generate-review-response-tasks', {
        body: { venue_id: venueId, week_start: cycle.weekStart, week_end: cycle.weekEnd },
      });
      if (triage.error || triage.data?.error) {
        errors.push(`Triage failed: ${triage.error?.message || triage.data?.error}`);
      } else {
        completedSteps.push('triage');
      }

      const finalStatus = errors.length === 0 ? 'success' : completedSteps.length > 0 ? 'partial' : 'failed';

      await supabase
        .from('review_automation_runs' as any)
        .update({
          status: finalStatus,
          steps_completed: completedSteps,
          error_message: errors.length ? errors.join(' ') : null,
          scheduled_for: nowIso,
        } as any)
        .eq('id', runRow.id);

      if (errors.length) throw new Error(errors.join(' '));
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews-health', venueId] });
      queryClient.invalidateQueries({ queryKey: ['response-tasks-workflow', venueId] });
      queryClient.invalidateQueries({ queryKey: ['weekly-report', venueId] });
      toast({ title: 'Weekly review cycle completed' });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['reviews-health', venueId] });
      toast({ title: 'Weekly cycle finished with issues', description: e.message, variant: 'destructive' });
    },
  });

  const fetchNow = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke('ingest-reviews', {
        body: { venue_id: venueId },
      });
      if (error) throw error;
      if (result?.errors?.length) throw new Error(result.errors.join(' '));
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['reviews-health', venueId] });
      queryClient.invalidateQueries({ queryKey: ['reviews-workflow', venueId] });
      toast({ title: 'Reviews fetched', description: `${result?.fetched_count || 0} reviews imported.` });
    },
    onError: (e: any) => toast({ title: 'Fetch failed', description: e.message, variant: 'destructive' }),
  });

  const latestRun = data?.latestRun;
  const connected = data?.connectedSources || 0;
  const hasFailed = ['failed', 'error', 'partial'].includes(String(latestRun?.status || ''));
  const lastRunDate = latestRun?.created_at ? new Date(latestRun.created_at) : null;
  const lastSuccessDate = data?.lastSuccess?.created_at ? new Date(data.lastSuccess.created_at) : null;
  const isStale = lastSuccessDate ? (Date.now() - lastSuccessDate.getTime()) > 8 * 24 * 60 * 60 * 1000 : false;

  const healthLabel = connected === 0
    ? 'not connected'
    : !latestRun
      ? 'never run'
      : hasFailed
        ? 'failed'
        : isStale
          ? 'stale'
          : 'up to date';

  const ctaLabel = connected === 0
    ? 'Connect sources'
    : hasFailed || isStale || !latestRun
      ? 'Run now'
      : 'Fetch reviews now';

  const onPrimaryAction = () => {
    if (connected === 0) {
      onOpenSetup?.();
      return;
    }
    if (hasFailed || isStale || !latestRun) {
      runWeeklyNow.mutate();
      return;
    }
    fetchNow.mutate();
  };

  return (
    <Card className="border-accent/20 bg-accent/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Review automation health</p>
          <Button size="sm" onClick={onPrimaryAction} disabled={isLoading || runWeeklyNow.isPending || fetchNow.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${(runWeeklyNow.isPending || fetchNow.isPending) ? 'animate-spin' : ''}`} />
            {ctaLabel}
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-5 text-xs">
          <div className="rounded-md border bg-background p-2">
            <p className="text-muted-foreground">Reviews connected</p>
            <p className="font-medium">{connected > 0 ? 'Yes' : 'No'}</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="text-muted-foreground">Last run</p>
            <p className="font-medium">{lastRunDate ? format(lastRunDate, 'MMM d, HH:mm') : 'Never'}</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium capitalize">{healthLabel}</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="text-muted-foreground">Needs reply</p>
            <p className="font-medium">{data?.pendingCount || 0}</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="text-muted-foreground">Ready to approve</p>
            <p className="font-medium">{data?.draftCount || 0}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Reviews fetched this week: {data?.fetchedThisWeek || 0}
          {latestRun?.error_message ? ` • Last error: ${latestRun.error_message}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Weekly Report ───────────────────────────────────────────────────────

function WeeklyReport({ venueId, venueTimezone }: { venueId: string; venueTimezone: string }) {
  const queryClient = useQueryClient();
  const cycle = getCompletedReviewWeekRange(new Date(), venueTimezone);

  const { data: report, isLoading } = useQuery({
    queryKey: ['weekly-report', venueId, cycle.weekStart, cycle.weekEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_review_reports')
        .select('*')
        .eq('venue_id', venueId)
        .eq('week_start', cycle.weekStart)
        .eq('week_end', cycle.weekEnd)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-weekly-review-report', {
        body: { venue_id: venueId, week_start: cycle.weekStart, week_end: cycle.weekEnd },
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
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
          <FileText className={`w-4 h-4 mr-2 ${generate.isPending ? 'animate-spin' : ''}`} />
          Refresh this week
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading report...</div>
      ) : !report ? (
          <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No report generated yet for the week of {cycle.weekStart} to {cycle.weekEnd}.
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

function ReviewsSetupTab({ venueId }: { venueId: string }) {
  return (
    <div className="space-y-4">
      <ReviewSourcesSetup venueId={venueId} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Manual fetch</CardTitle>
          <CardDescription>Use this if you just changed source settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <IngestionPanel venueId={venueId} />
        </CardContent>
      </Card>

      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="text-sm font-medium">Advanced diagnostics & raw feed</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <ReviewFeed venueId={venueId} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ReviewsAnalytics() {

  const { currentVenue } = useVenue();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'inbox';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  if (!currentVenue) {
    return <div className="text-center py-12 text-muted-foreground">Select a brand to view reviews.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="Reviews & Feedback"
        description="Work from Inbox, check Insights, and manage Setup in one operational reviews flow."
      />

      <div className="mb-6">
        <AutomationStatusCard
          venueId={currentVenue.id}
          venueTimezone={currentVenue.timezone || 'Europe/London'}
          onOpenSetup={() => handleTabChange('setup')}
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="inbox" className="gap-2"><Sparkles className="w-4 h-4" />Inbox</TabsTrigger>
          <TabsTrigger value="insights" className="gap-2"><FileText className="w-4 h-4" />Insights</TabsTrigger>
          <TabsTrigger value="setup" className="gap-2"><Settings2 className="w-4 h-4" />Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox"><ReputationWorkflowTab venueId={currentVenue.id} /></TabsContent>
        <TabsContent value="insights"><WeeklyReport venueId={currentVenue.id} venueTimezone={currentVenue.timezone || 'Europe/London'} /></TabsContent>
        <TabsContent value="setup"><ReviewsSetupTab venueId={currentVenue.id} /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
