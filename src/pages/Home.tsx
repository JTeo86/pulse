import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ClipboardList,
  Home as HomeIcon,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  Megaphone,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';
import { PlansTab } from '@/components/planner/PlansTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  autopilotSettings: {
    frequency: 'daily' | '3x_week' | 'weekly' | null;
    runTime: string | null;
    isEnabled: boolean;
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
  const safeOpportunities = marketOpportunities ?? [];

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
        autopilotSettings,
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
          .select('id, scheduled_for')
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
          .select('status, run_status, created_at, items_saved, saved_count')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('autopilot_settings')
          .select('frequency, run_time, is_enabled')
          .eq('venue_id', currentVenue.id)
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
        performanceInsights: generatePerformanceInsights(performanceInput),
        weeklyPerformanceReport: generateWeeklyPulseReport(performanceInput),
        lastAutopilotRun: run
          ? {
              status: run.run_status || run.status || 'completed',
              createdAt: run.created_at,
              generatedPosts,
              generatedReplies,
            }
          : null,
        autopilotSettings: autopilotSettings.data
          ? {
              frequency: ((autopilotSettings.data as any).frequency as 'daily' | '3x_week' | 'weekly' | null) ?? null,
              runTime: (autopilotSettings.data as any).run_time ?? null,
              isEnabled: (autopilotSettings.data as any).is_enabled ?? false,
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

      return {
        unusedCount: assets.filter((asset) => !usedIds.has(asset.id)).length,
        lastUploadAt: assets[0]?.created_at || null,
      };
    },
  });

  const { data: latestPulseReport } = useQuery({
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
    if (next === 'today') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };

  const greeting = getGreeting();
  const venueName = currentVenue?.name?.trim() || 'there';
  const headerTitle = currentVenue ? `${greeting}, ${venueName}` : greeting;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title={headerTitle}
        description="Your calm command centre for reputation, visibility, approvals, and commercial opportunities."
      />

      <ReferralHomeCards />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-8">
        <TabsList className="bg-muted/20 p-1">
          <TabsTrigger value="today" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <HomeIcon className="w-4 h-4" /> Command Centre
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2 opacity-60 data-[state=active]:opacity-100 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <CalendarDays className="w-4 h-4" /> Opportunities
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2 opacity-60 data-[state=active]:opacity-100 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <ClipboardList className="w-4 h-4" /> Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              icon={ShieldAlert}
              label="Approvals Needed"
              value={(overview?.pendingContent?.length ?? 0) + (overview?.pendingRepliesCount ?? 0)}
              detail="Replies, campaigns, and publishing work waiting on approval"
            />
            <SummaryMetric
              icon={AlertTriangle}
              label="Urgent Review Risk"
              value={overview?.urgentReviewsCount ?? 0}
              detail="Low-rating or priority review issues requiring attention"
            />
            <SummaryMetric
              icon={Megaphone}
              label="Visibility Gaps"
              value={overview?.coverageGaps?.length ?? 0}
              detail={overview?.coverageGaps?.[0] || 'No critical visibility gaps detected'}
            />
            <SummaryMetric
              icon={TrendingUp}
              label="Open Opportunities"
              value={safeOpportunities.length}
              detail={safeOpportunities[0]?.title || 'No immediate opportunities detected'}
            />
          </div>

          <Card className="border-amber-400/50 bg-amber-50/40 dark:bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Approvals Needed
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <ActionRow
                title="Campaigns and posts ready to approve"
                detail={`${overview?.pendingContent?.length ?? 0} waiting for approval`}
                to="/assets"
                actionLabel="Review"
              />
              <ActionRow
                title="Review replies awaiting approval"
                detail={`${overview?.pendingRepliesCount ?? 0} waiting to send`}
                to="/reputation/reviews?tab=inbox"
                actionLabel="Review"
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  Reputation Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3 text-sm">
                <CommandInsight title="Positive guest theme" body={overview?.positiveTheme || 'No clear positive signal yet'} />
                <CommandInsight title="Recurring complaint" body={overview?.negativeTheme || 'No recurring complaint trend detected yet'} />
                <CommandInsight
                  title="Response coverage"
                  body={`${overview?.pendingRepliesCount ?? 0} reviews remain in the response queue${overview?.urgentReviewsCount ? `, including ${overview.urgentReviewsCount} urgent` : ''}.`}
                />
                {latestPulseReport?.pulse_report?.reputation_summary ? (
                  <CommandInsight title="Weekly summary" body={latestPulseReport.pulse_report.reputation_summary} />
                ) : null}
                <InlineLink to="/reputation/reviews" label="Open Reputation" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-accent" />
                  Visibility Coverage
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3 text-sm">
                {overviewLoading || contentHealthLoading ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : (
                  <>
                    <CommandInsight title="Days ahead covered" body={`${overview?.coveredDaysCount ?? 0} active days covered in the next two weeks.`} />
                    <CommandInsight title="Content gaps" body={overview?.coverageGaps?.join(' • ') || 'No major gaps detected right now.'} />
                    <CommandInsight
                      title="Asset readiness"
                      body={contentHealth?.unusedCount
                        ? `${contentHealth.unusedCount} uploaded assets are still unused.${contentHealth.lastUploadAt ? ` Last upload ${formatDistanceToNow(new Date(contentHealth.lastUploadAt), { addSuffix: true })}.` : ''}`
                        : 'Uploaded assets are already being used across campaigns.'}
                    />
                  </>
                )}
                <InlineLink to="/campaigns" label="Open Campaigns" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Revenue Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {opportunitiesLoading ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : safeOpportunities.length ? (
                  safeOpportunities.slice(0, 3).map((opportunity) => (
                    <div key={opportunity.title} className="rounded-lg bg-muted/20 p-3 space-y-1.5">
                      <p className="text-sm font-medium">{opportunity.title}</p>
                      <p className="text-xs text-muted-foreground">{opportunity.description}</p>
                      <p className="text-xs text-foreground/85">{opportunity.suggestedAction}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No open opportunities right now.</p>
                )}
                <InlineLink to="/opportunities" label="Open Opportunities" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  Pulse Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3 text-sm">
                {overview?.lastAutopilotRun ? (
                  <>
                    <CommandInsight
                      title="Prepared by Pulse"
                      body={`Pulse prepared ${overview.lastAutopilotRun.generatedPosts} posts and drafted ${overview.lastAutopilotRun.generatedReplies} replies.`}
                    />
                    <CommandInsight title="Last run" body={formatLastRun(overview.lastAutopilotRun.createdAt)} />
                  </>
                ) : (
                  <CommandInsight title="Pulse status" body="Pulse is standing by and ready to prepare your next week." />
                )}
                <CommandInsight
                  title="Automation"
                  body={`${overview?.autopilotSettings?.isEnabled ? 'Pulse is running.' : 'Pulse is paused.'} Next run ${getNextRunLabel(
                    overview?.autopilotSettings?.frequency,
                    overview?.autopilotSettings?.runTime,
                    overview?.autopilotSettings?.isEnabled ?? false,
                  )}.`}
                />
                {overview?.performanceInsights?.[0] ? (
                  <CommandInsight title="Commercial readout" body={overview.performanceInsights[0]} />
                ) : null}
                {latestPulseReport?.pulse_report?.next_week_focus?.length ? (
                  <CommandInsight title="Next focus" body={latestPulseReport.pulse_report.next_week_focus.slice(0, 2).join(' • ')} />
                ) : null}
                <InlineLink to="/publishing" label="Open Publishing" />
              </CardContent>
            </Card>
          </div>
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

function ActionRow({ title, detail, to, actionLabel = 'Open' }: { title: string; detail: string; to: string; actionLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link to={to}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: any;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function CommandInsight({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-muted/20 p-3 space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-sm">{body}</p>
    </div>
  );
}

function InlineLink({ to, label }: { to: string; label: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <Link to={to}>
        {label}
        <ArrowRight className="w-3.5 h-3.5 ml-1" />
      </Link>
    </Button>
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

function getNextRunLabel(
  frequency?: 'daily' | '3x_week' | 'weekly' | null,
  runTime?: string | null,
  isEnabled?: boolean,
) {
  if (!isEnabled) return 'disabled';
  if (!frequency || !runTime) return 'is set in Settings';

  const now = new Date();
  const [hour, minute] = runTime.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hour || 9, minute || 0, 0, 0);

  if (frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    next.setDate(next.getDate() + 2);
  }

  return formatDistanceToNow(next, { addSuffix: true });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
