import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, Home as HomeIcon, Sparkles, AlertTriangle, Clock3, CheckCircle2 } from 'lucide-react';
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
import { useMarketOpportunities } from '@/hooks/use-market-opportunities';
import { ReferralHomeCards } from '@/components/home/ReferralHomeCards';
import { generatePerformanceInsights, generateWeeklyPulseReport, type WeeklyPulseReport } from '@/lib/performance-feedback';

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
  performanceInsights: string[];
  weeklyPerformanceReport: WeeklyPulseReport;
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
        recentContentItems,
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
          .from('content_items')
          .select('id, title, caption_draft, scheduled_for, created_at, badges')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(80),
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
      const recentContentRows = recentContentItems.data ?? [];

      const urgentReviewsCount = pendingReplyRows.filter((task) => (task.rating ?? 5) <= 2 || task.ai_priority === 'P1').length;
      const { positiveTheme, negativeTheme } = detectThemes(recentReviewsRows);
      const coverage = buildCoverageSummary(scheduledContent.data ?? []);

      const run = latestAutopilotRun.data;
      const generatedPosts = run?.saved_count ?? run?.items_saved ?? 0;
      const generatedReplies = pendingReplyRows.filter((row) => Boolean(row.draft_response?.trim())).length;
      const performanceInput = {
        posts: recentContentRows.map((item: any) => ({
          id: item.id,
          title: item.title,
          caption: item.caption_draft,
          scheduledFor: item.scheduled_for,
          createdAt: item.created_at,
          reused: (item.badges || []).some((badge: string) => badge.toLowerCase().includes('reuse')),
        })),
        reviewMentions: recentReviewsRows.map((review: any) => String(review.review_text || '')),
        frequencyPerWeek: recentContentRows.length,
      };
      const performanceInsights = generatePerformanceInsights(performanceInput);
      const weeklyPerformanceReport = generateWeeklyPulseReport(performanceInput);

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
        performanceInsights,
        weeklyPerformanceReport,
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

  const greeting = getGreeting();
  const headerTitle = currentVenue ? `${greeting}, ${currentVenue.name}` : `${greeting}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title={headerTitle}
        description="One place to run your week: Photos, Ready, Calendar, Plans, and Reviews."
      />

      <ReferralHomeCards />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="today" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <HomeIcon className="w-4 h-4" /> Today
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2 opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <CalendarDays className="w-4 h-4" /> Opportunities
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2 opacity-70 data-[state=active]:opacity-100 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <ClipboardList className="w-4 h-4" /> Plans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-5">
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader className="pb-2"><CardTitle className="text-base">This Week summary</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-0">
              <SummaryLine label="Posts ready" value={`${overview?.preparedContentCount ?? 0}`} tone="good" />
              <SummaryLine label="Needs approval" value={`${overview?.pendingContent.length ?? 0}`} tone={(overview?.pendingContent.length ?? 0) > 0 ? 'warning' : 'neutral'} />
              <SummaryLine label="Missing content" value={`${overview?.coverageGaps.length ?? 0}`} tone={(overview?.coverageGaps.length ?? 0) > 0 ? 'warning' : 'neutral'} />
              <SummaryLine label="Reviews" value={`${overview?.pendingRepliesCount ?? 0} to reply`} tone={(overview?.pendingRepliesCount ?? 0) > 0 ? 'warning' : 'neutral'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Next steps</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-2">
              <ActionRow title="Review Ready posts" detail={`${overview?.pendingContent.length ?? 0} posts are ready for approval`} to="/content/library" />
              <ActionRow title="Add Photos" detail={contentHealth?.lastUploadAt ? `Last upload ${formatDistanceToNow(new Date(contentHealth.lastUploadAt), { addSuffix: true })}` : 'No photos uploaded yet'} to="/content/feed" />
              <ActionRow title="Reply to Reviews" detail={`${overview?.pendingRepliesCount ?? 0} replies are ready to send`} to="/reputation/reviews?tab=inbox" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Opportunities</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {opportunitiesLoading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : marketOpportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open opportunities right now.</p>
              ) : (
                marketOpportunities.slice(0, 4).map((opportunity) => (
                  <div key={opportunity.title} className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">{opportunity.title}</p>
                    <p className="text-xs text-muted-foreground">{opportunity.description}</p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" asChild>
                        <Link to="/home?tab=plans">Create plan</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/home?tab=opportunities">Open opportunities</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-accent" />Pulse automation</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1 text-sm">
              {overview?.lastAutopilotRun ? (
                <>
                  <p>I prepared content {formatLastRun(overview.lastAutopilotRun.createdAt)}.</p>
                  <p className="text-muted-foreground">{overview.lastAutopilotRun.generatedPosts} posts prepared · {overview.lastAutopilotRun.generatedReplies} replies drafted.</p>
                </>
              ) : (
                <p className="text-muted-foreground">No recent activity yet.</p>
              )}
              {latestPulseReport?.generated_at && (
                <p className="text-muted-foreground">Weekly brief generated {formatDistanceToNow(new Date(latestPulseReport.generated_at), { addSuffix: true })}.</p>
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

function ActionRow({ title, detail, to }: { title: string; detail: string; to: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button size="sm" asChild>
        <Link to={to}>Open</Link>
      </Button>
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
  if (!coveredDays.has(5)) gaps.push('No Friday visibility');
  if (!coveredDays.has(6) && !coveredDays.has(0)) gaps.push('No weekend visibility');
  if (![1, 2, 3, 4].some((day) => coveredDays.has(day))) gaps.push('No lunch visibility this week');

  return {
    coveredDaysCount: coveredDays.size,
    gaps,
  };
}

function formatLastRun(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} • ${formatDistanceToNow(date, { addSuffix: true })}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
