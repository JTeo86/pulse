import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, RefreshCw, FileText, MessageSquare, Settings2, Search, Calendar } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

// ---------- Review Sources Setup ----------
function ReviewSourcesSetup({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const [googlePlaceId, setGooglePlaceId] = useState('');
  const [opentableUrl, setOpentableUrl] = useState('');

  const { data: sources, isLoading } = useQuery({
    queryKey: ['review-sources', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_sources')
        .select('*')
        .eq('venue_id', venueId);
      if (error) throw error;
      return data as Tables<'review_sources'>[];
    },
  });

  const addSource = useMutation({
    mutationFn: async ({ source, external_id }: { source: string; external_id: string }) => {
      const { error } = await supabase.from('review_sources').insert({
        venue_id: venueId,
        source,
        external_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-sources', venueId] });
      toast({ title: 'Source added' });
      setGooglePlaceId('');
      setOpentableUrl('');
    },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const googleSource = sources?.find(s => s.source === 'google');
  const otSource = sources?.find(s => s.source === 'opentable');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Reviews</CardTitle>
          <CardDescription>Enter your Google Place ID to fetch reviews</CardDescription>
        </CardHeader>
        <CardContent>
          {googleSource ? (
            <div className="space-y-2">
              <Badge variant="outline" className="bg-accent/10 text-accent">Connected</Badge>
              <p className="text-sm text-muted-foreground font-mono">{googleSource.external_id}</p>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="ChIJ..."
                value={googlePlaceId}
                onChange={e => setGooglePlaceId(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!googlePlaceId || addSource.isPending}
                onClick={() => addSource.mutate({ source: 'google', external_id: googlePlaceId })}
              >
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">OpenTable Reviews</CardTitle>
          <CardDescription>Enter your OpenTable restaurant URL</CardDescription>
        </CardHeader>
        <CardContent>
          {otSource ? (
            <div className="space-y-2">
              <Badge variant="outline" className="bg-accent/10 text-accent">Connected</Badge>
              <p className="text-sm text-muted-foreground font-mono truncate">{otSource.external_id}</p>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="https://www.opentable.com/r/..."
                value={opentableUrl}
                onChange={e => setOpentableUrl(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!opentableUrl || addSource.isPending}
                onClick={() => addSource.mutate({ source: 'opentable', external_id: opentableUrl })}
              >
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Review Feed ----------
function ReviewFeed({ venueId }: { venueId: string }) {
  const [search, setSearch] = useState('');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['reviews', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('venue_id', venueId)
        .order('review_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Tables<'reviews'>[];
    },
  });

  const filtered = reviews?.filter(r =>
    !search || r.review_text?.toLowerCase().includes(search.toLowerCase()) ||
    r.author_name?.toLowerCase().includes(search.toLowerCase())
  );

  const renderStars = (rating: number | null) => {
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
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search reviews..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading reviews...</div>
      ) : !filtered?.length ? (
        <div className="text-center py-8 text-muted-foreground">
          No reviews yet. Set up your sources and run an ingestion.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.author_name || 'Anonymous'}</span>
                      {renderStars(r.rating)}
                      <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{r.review_text || 'No text'}</p>
                  </div>
                  {r.review_date && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(r.review_date), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Weekly Report ----------
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
      return data as Tables<'weekly_review_reports'> | null;
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

  const ingest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ingest-reviews', {
        body: { venue_id: venueId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reviews', venueId] });
      toast({ title: `Ingested ${data?.ingested || 0} reviews`, description: data?.errors?.length ? `${data.errors.length} warnings` : undefined });
    },
    onError: (e) => toast({ title: 'Ingestion error', description: e.message, variant: 'destructive' }),
  });

  const actionItems = (report?.action_items as any) || {};
  const stats = (report?.stats as any) || {};
  const replyTemplates = (report?.reply_templates as any[]) || [];

  const priorityColor: Record<string, string> = {
    P1: 'bg-destructive/10 text-destructive border-destructive/20',
    P2: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    P3: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="space-y-6">
      {/* Actions Bar */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => ingest.mutate()} disabled={ingest.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${ingest.isPending ? 'animate-spin' : ''}`} />
          Fetch Reviews
        </Button>
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
          {/* Stats */}
          {stats.total_reviews && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold">{stats.total_reviews}</p>
                <p className="text-xs text-muted-foreground">Total Reviews</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold">{stats.avg_rating?.toFixed(1) || '—'}</p>
                <p className="text-xs text-muted-foreground">Avg Rating</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-accent">{stats.five_star_count || 0}</p>
                <p className="text-xs text-muted-foreground">5-Star</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-destructive">{stats.one_two_star_count || 0}</p>
                <p className="text-xs text-muted-foreground">1-2 Star</p>
              </CardContent></Card>
            </div>
          )}

          {/* Headline & Summary */}
          {actionItems.headline && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{actionItems.headline}</CardTitle>
                <CardDescription>Week of {report.week_start} to {report.week_end}</CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: report.summary_md?.replace(/\n/g, '<br/>') || '' }} />
              </CardContent>
            </Card>
          )}

          {/* What went well / What to fix */}
          <div className="grid gap-4 md:grid-cols-2">
            {actionItems.what_went_well?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-accent">✓ What Went Well</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {actionItems.what_went_well.map((item: string, i: number) => (
                      <li key={i} className="text-muted-foreground">• {item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {actionItems.what_to_fix?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-destructive">✗ What to Fix</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {actionItems.what_to_fix.map((item: string, i: number) => (
                      <li key={i} className="text-muted-foreground">• {item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Action Items */}
          {actionItems.items?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Action Items</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {actionItems.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 py-2">
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${priorityColor[item.priority] || ''}`}>
                        {item.priority}
                      </Badge>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{item.team}</Badge>
                      <span className="text-sm text-muted-foreground">{item.action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reply Templates */}
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

// ---------- Main Page ----------
export default function ReviewsAnalytics() {
  const { currentVenue } = useVenue();

  if (!currentVenue) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Select a brand to view reviews.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Reviews & Feedback"
          description="Aggregate reviews from Google and OpenTable, generate AI-powered weekly reports."
        />

        <Tabs defaultValue="report" className="space-y-6">
          <TabsList>
            <TabsTrigger value="report" className="gap-2">
              <FileText className="w-4 h-4" />
              Weekly Report
            </TabsTrigger>
            <TabsTrigger value="feed" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Review Feed
            </TabsTrigger>
            <TabsTrigger value="setup" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Sources Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report">
            <WeeklyReport venueId={currentVenue.id} />
          </TabsContent>

          <TabsContent value="feed">
            <ReviewFeed venueId={currentVenue.id} />
          </TabsContent>

          <TabsContent value="setup">
            <ReviewSourcesSetup venueId={currentVenue.id} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
