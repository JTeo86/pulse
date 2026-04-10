import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, Home as HomeIcon, Sparkles, CheckCircle2, Pencil, XCircle, AlertTriangle, Clock3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';
import { PlansTab } from '@/components/planner/PlansTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useMarketOpportunities } from '@/hooks/use-market-opportunities';
import { ReferralHomeCards } from '@/components/home/ReferralHomeCards';

type HomeTab = 'today' | 'opportunities' | 'plans';

type ReplyTask = {
  id: string;
  author_name: string | null;
  review_text: string | null;
  rating: number | null;
  draft_response: string | null;
  ai_priority: string | null;
};

type ContentApprovalItem = {
  id: string;
  title: string | null;
  caption_draft: string | null;
  scheduled_for: string | null;
  created_at: string;
};

interface TodayOverview {
  preparedContentCount: number;
  pendingRepliesCount: number;
  urgentReviewsCount: number;
  positiveTheme: string;
  negativeTheme: string | null;
  coveredDaysCount: number;
  coverageGaps: string[];
  pendingReplies: ReplyTask[];
  pendingContent: ContentApprovalItem[];
  lastAutopilotRun: {
    status: string;
    createdAt: string;
    generatedPosts: number;
    generatedReplies: number;
  } | null;
}

interface ContentHealthSummary {
  unusedCount: number;
  lastUploadAt: string | null;
}

interface WeeklyPulseBrief {
  week_start: string;
  week_end: string;
  generated_at: string | null;
  pulse_report: {
    reputation_summary?: string;
    content_summary?: string;
    opportunities?: string[];
    pulse_activity?: string[];
    next_week_focus?: string[];
  } | null;
}

const themeKeywords: Record<string, string[]> = {
  food: ['food', 'dish', 'menu', 'tasting', 'meal', 'flavor', 'taste', 'dessert', 'cocktail', 'wine', 'drinks', 'omakase'],
  service: ['service', 'staff', 'server', 'host', 'manager', 'wait', 'friendly', 'rude', 'attentive', 'slow'],
  ambiance: ['ambiance', 'atmosphere', 'music', 'lighting', 'decor', 'vibe', 'noise', 'noisy', 'loud', 'quiet'],
  value: ['value', 'price', 'expensive', 'overpriced', 'worth', 'portion', 'bill', 'cost', 'affordable'],
};

const themeLabels: Record<string, string> = {
  food: 'Food quality',
  service: 'Service',
  ambiance: 'Atmosphere',
  value: 'Value perception',
};

export default function Home() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = useMemo<HomeTab>(() => {
    const tab = searchParams.get('tab');
    return tab === 'opportunities' || tab === 'plans' ? tab : 'today';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<HomeTab>(initialTab);
  const { opportunities: marketOpportunities, isLoading: opportunitiesLoading } = useMarketOpportunities(5);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['home-command-centre-overview', currentVenue?.id],
    queryFn: async (): Promise<TodayOverview | null> => {
      if (!currentVenue) return null;

      const now = new Date();
      const twoWeeksOut = new Date(now);
      twoWeeksOut.setDate(now.getDate() + 14);

      const [
        pendingReplies,
        contentDrafts,
        scheduledContent,
        recentReviews,
        latestAutopilotRun,
      ] = await Promise.all([
        supabase
          .from('review_response_tasks')
          .select('id, author_name, review_text, rating, draft_response, ai_priority')
          .eq('venue_id', currentVenue.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('content_items')
          .select('id, title, caption_draft, scheduled_for, created_at')
          .eq('venue_id', currentVenue.id)
          .eq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('content_items')
          .select('id, scheduled_for', { count: 'exact' })
          .eq('venue_id', currentVenue.id)
          .not('scheduled_for', 'is', null)
          .gte('scheduled_for', now.toISOString())
          .lt('scheduled_for', twoWeeksOut.toISOString()),
        supabase
          .from('review_response_tasks')
          .select('review_text, rating')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('autopilot_runs')
          .select('status, run_status, created_at, items_saved, saved_count, output_summary')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const pendingReplyRows = pendingReplies.data ?? [];
      const pendingContentRows = contentDrafts.data ?? [];
      const recentReviewsRows = recentReviews.data ?? [];

      const urgentReviewsCount = pendingReplyRows.filter((task) => (task.rating ?? 5) <= 2 || task.ai_priority === 'P1').length;
      const { positiveTheme, negativeTheme } = detectThemes(recentReviewsRows);
      const coverage = buildCoverageSummary(scheduledContent.data ?? []);

      const run = latestAutopilotRun.data;
      const generatedPosts = run?.saved_count ?? run?.items_saved ?? 0;
      const generatedReplies = pendingReplyRows.filter((row) => Boolean(row.draft_response?.trim())).length;

      return {
        preparedContentCount: pendingContentRows.length,
        pendingRepliesCount: pendingReplyRows.length,
        urgentReviewsCount,
        positiveTheme,
        negativeTheme,
        coveredDaysCount: coverage.coveredDaysCount,
        coverageGaps: coverage.gaps,
        pendingReplies: pendingReplyRows,
        pendingContent: pendingContentRows,
        lastAutopilotRun: run
          ? {
              status: run.run_status || run.status || 'completed',
              createdAt: run.created_at,
              generatedPosts,
              generatedReplies,
            }
          : null,
      };
    },
    enabled: !!currentVenue,
  });

  const { data: contentHealth, isLoading: contentHealthLoading } = useQuery({
    queryKey: ['content-health-summary', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async (): Promise<ContentHealthSummary> => {
      if (!currentVenue) return { unusedCount: 0, lastUploadAt: null };

      const [assetsRes, usageRes] = await Promise.all([
        supabase
          .from('content_assets')
          .select('id, created_at')
          .eq('venue_id', currentVenue.id)
          .eq('asset_type', 'image')
          .in('source_type', ['upload', 'manual', 'guest_upload'])
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('content_items')
          .select('media_variants')
          .eq('venue_id', currentVenue.id)
          .eq('source', 'autopilot')
          .limit(600),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (usageRes.error) throw usageRes.error;

      const usedIds = new Set<string>();
      for (const row of usageRes.data || []) {
        const variants = row.media_variants as Record<string, any> | null;
        const sourceAssetId = variants?.source_asset_id;
        if (sourceAssetId) usedIds.add(sourceAssetId);
      }

      const assets = assetsRes.data || [];
      const unusedCount = assets.filter((asset) => !usedIds.has(asset.id)).length;

      return {
        unusedCount,
        lastUploadAt: assets[0]?.created_at || null,
      };
    },
  });

  const { data: latestPulseReport, isLoading: pulseReportLoading } = useQuery({
    queryKey: ['latest-pulse-report', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async (): Promise<WeeklyPulseBrief | null> => {
      if (!currentVenue) return null;

      const { data, error } = await (supabase.from('venue_weekly_briefs') as any)
        .select('week_start, week_end, generated_at, pulse_report')
        .eq('venue_id', currentVenue.id)
        .not('generated_at', 'is', null)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as WeeklyPulseBrief | null;
    },
  });

  const approveReply = useMutation({
    mutationFn: async (task: ReplyTask) => {
      if (!task.draft_response?.trim()) throw new Error('Draft reply missing');
      const { error } = await supabase
        .from('review_response_tasks')
        .update({
          final_response: task.draft_response,
          status: 'responded',
          approved_at: new Date().toISOString(),
        })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-command-centre-overview', currentVenue?.id] });
      toast({ title: 'Reply approved' });
    },
    onError: (error: Error) => toast({ title: 'Could not approve reply', description: error.message, variant: 'destructive' }),
  });

  const rejectReply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('review_response_tasks')
        .update({ status: 'ignored' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-command-centre-overview', currentVenue?.id] });
      toast({ title: 'Reply rejected' });
    },
    onError: (error: Error) => toast({ title: 'Could not reject reply', description: error.message, variant: 'destructive' }),
  });

  const approveContent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('content_items')
        .update({ status: 'ready' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-command-centre-overview', currentVenue?.id] });
      toast({ title: 'Content approved' });
    },
    onError: (error: Error) => toast({ title: 'Could not approve content', description: error.message, variant: 'destructive' }),
  });

  const rejectContent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('content_items')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-command-centre-overview', currentVenue?.id] });
      toast({ title: 'Content rejected' });
    },
    onError: (error: Error) => toast({ title: 'Could not reject content', description: error.message, variant: 'destructive' }),
  });

  const handleTabChange = (value: string) => {
    const next = (value as HomeTab) || 'today';
    setActiveTab(next);

    const nextParams = new URLSearchParams(searchParams);
    if (next === 'today') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', next);
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title={`Command Centre${currentVenue ? ` • ${currentVenue.name}` : ''}`}
        description="Pulse has prepared your week. Review, approve, and publish from this screen."
      />

      <ReferralHomeCards />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="today" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <HomeIcon className="w-4 h-4" /> Command Centre
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2 opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <CalendarDays className="w-4 h-4" /> Opportunities
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2 opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <ClipboardList className="w-4 h-4" /> Plans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-5">
          {overviewLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : (
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pulse prepared your week</p>
                    <p className="text-2xl font-semibold">{(overview?.preparedContentCount ?? 0) + (overview?.pendingRepliesCount ?? 0)} items ready for your sign-off</p>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span>{overview?.preparedContentCount ?? 0} content items ready</span>
                      <span>•</span>
                      <span>{overview?.pendingRepliesCount ?? 0} replies drafted</span>
                      <span>•</span>
                      <span>{marketOpportunities.length} opportunities detected</span>
                    </div>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/reputation/reviews?tab=respond">Review now</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your latest Pulse report</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {pulseReportLoading ? (
                <Skeleton className="h-24 rounded-lg" />
              ) : !latestPulseReport?.pulse_report ? (
                <p className="text-sm text-muted-foreground">
                  Your weekly report will appear here after the next Monday morning cycle.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Week of {latestPulseReport.week_start} to {latestPulseReport.week_end}
                  </p>
                  <p className="text-sm">{latestPulseReport.pulse_report.reputation_summary || 'No reputation summary yet.'}</p>
                  <p className="text-sm text-muted-foreground">{latestPulseReport.pulse_report.content_summary || 'No content summary yet.'}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Top opportunities</p>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        {(latestPulseReport.pulse_report.opportunities || []).slice(0, 2).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Next week focus</p>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        {(latestPulseReport.pulse_report.next_week_focus || []).slice(0, 2).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Approvals needed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {overviewLoading ? (
                  <Skeleton className="h-36 rounded-lg" />
                ) : (
                  <>
                    {overview?.pendingReplies.slice(0, 3).map((task) => (
                      <ApprovalRow
                        key={task.id}
                        title={`${task.author_name || 'Guest'}${task.rating ? ` • ${task.rating}★` : ''}`}
                        subtitle={task.review_text || 'Review text unavailable'}
                        onApprove={() => approveReply.mutate(task)}
                        onReject={() => rejectReply.mutate(task.id)}
                        editTo="/reputation/reviews?tab=respond"
                        disabled={!task.draft_response?.trim()}
                      />
                    ))}

                    {overview?.pendingContent.slice(0, 3).map((item) => (
                      <ApprovalRow
                        key={item.id}
                        title={item.title || 'Untitled draft post'}
                        subtitle={item.caption_draft || 'Caption draft pending'}
                        onApprove={() => approveContent.mutate(item.id)}
                        onReject={() => rejectContent.mutate(item.id)}
                        editTo="/content/library"
                      />
                    ))}

                    {!overview?.pendingReplies.length && !overview?.pendingContent.length && (
                      <p className="text-sm text-muted-foreground">No approvals waiting. Pulse queue is clear.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reputation snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <SummaryLine label="Top positive theme" value={overview?.positiveTheme || 'Not enough review text yet'} tone="good" />
                <SummaryLine label="Recurring negative theme" value={overview?.negativeTheme || 'No repeating complaints detected'} tone={overview?.negativeTheme ? 'warning' : 'neutral'} />
                <SummaryLine label="Urgent reviews needing reply" value={`${overview?.urgentReviewsCount ?? 0} open`} tone={(overview?.urgentReviewsCount ?? 0) > 0 ? 'warning' : 'neutral'} />
                <Button variant="outline" size="sm" asChild>
                  <Link to="/reputation/reviews?tab=respond">Open review queue</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Content coverage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-lg font-semibold">You have {overview?.coveredDaysCount ?? 0} days covered</p>
                <div className="flex flex-wrap gap-2">
                  {(overview?.coverageGaps.length ? overview.coverageGaps : ['Coverage looks healthy']).map((gap) => (
                    <Badge key={gap} variant="outline" className="text-xs">
                      {gap}
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/content/calendar">Fill gaps</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Content Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {contentHealthLoading ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {(contentHealth?.unusedCount ?? 0) > 0
                        ? `You have ${contentHealth?.unusedCount ?? 0} unused photos`
                        : 'You're running low on content'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {contentHealth?.lastUploadAt
                        ? `Last upload ${formatDistanceToNow(new Date(contentHealth.lastUploadAt), { addSuffix: true })}`
                        : 'No photos uploaded yet'}
                    </p>
                  </>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link to="/content/feed">Add Photos</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Opportunities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {opportunitiesLoading ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : marketOpportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No immediate opportunities detected.</p>
                ) : (
                  marketOpportunities.slice(0, 5).map((item) => (
                    <div key={`${item.title}-${item.suggestedAction}`} className="rounded-md border border-border/60 p-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                      <p className="text-xs mt-1">Action: {item.suggestedAction}</p>
                    </div>
                  ))
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/home?tab=opportunities">View more</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/plans">Generate Campaign</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Pulse engine
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!overview?.lastAutopilotRun ? (
                <p className="text-sm text-muted-foreground">Pulse is active. Run history will appear after the next automation cycle.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Pulse is active</p>
                  <p>Last run: {formatLastRun(overview.lastAutopilotRun.createdAt)} ({overview.lastAutopilotRun.status.replace('_', ' ')})</p>
                  <p className="text-muted-foreground">Generated {overview.lastAutopilotRun.generatedPosts} posts and {overview.lastAutopilotRun.generatedReplies} replies.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opportunities">
          <OpportunitiesTab />
        </TabsContent>

        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function ApprovalRow({
  title,
  subtitle,
  editTo,
  onApprove,
  onReject,
  disabled,
}: {
  title: string;
  subtitle: string;
  editTo: string;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{subtitle}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={onApprove} disabled={disabled}>
          <CheckCircle2 className="w-3 h-3" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
          <Link to={editTo}><Pencil className="w-3 h-3" /> Edit</Link>
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={onReject}>
          <XCircle className="w-3 h-3" /> Reject
        </Button>
      </div>
    </div>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warning' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium flex items-center gap-1.5 text-right">
        {tone === 'good' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : tone === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> : <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />}
        <span>{value}</span>
      </p>
    </div>
  );
}

function detectThemes(reviews: Array<{ review_text: string | null; rating: number | null }>) {
  const positiveCounts: Record<string, number> = { food: 0, service: 0, ambiance: 0, value: 0 };
  const negativeCounts: Record<string, number> = { food: 0, service: 0, ambiance: 0, value: 0 };

  for (const review of reviews) {
    const text = (review.review_text || '').toLowerCase();
    const matchedTheme = Object.entries(themeKeywords).find(([_, keywords]) => keywords.some((word) => text.includes(word)))?.[0];
    if (!matchedTheme) continue;

    if ((review.rating ?? 0) >= 4) positiveCounts[matchedTheme] += 1;
    if ((review.rating ?? 5) <= 2) negativeCounts[matchedTheme] += 1;
  }

  const topPositive = Object.entries(positiveCounts).sort((a, b) => b[1] - a[1])[0];
  const topNegative = Object.entries(negativeCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    positiveTheme: topPositive?.[1] > 0 ? themeLabels[topPositive[0]] : 'No clear positive signal yet',
    negativeTheme: topNegative?.[1] >= 2 ? themeLabels[topNegative[0]] : null,
  };
}

function buildCoverageSummary(scheduledItems: Array<{ scheduled_for: string | null }>) {
  const coveredDays = new Set<number>();

  for (const item of scheduledItems) {
    if (!item.scheduled_for) continue;
    coveredDays.add(new Date(item.scheduled_for).getDay());
  }

  const gaps: string[] = [];
  if (!coveredDays.has(5)) gaps.push('No Friday push');
  if (!coveredDays.has(6) && !coveredDays.has(0)) gaps.push('No weekend visibility');
  if (![1, 2, 3, 4].some((day) => coveredDays.has(day))) gaps.push('No lunch-week visibility');

  return {
    coveredDaysCount: coveredDays.size,
    gaps,
  };
}

function formatLastRun(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} • ${formatDistanceToNow(date, { addSuffix: true })}`;
}
