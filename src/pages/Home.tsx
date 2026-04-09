import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, Home as HomeIcon, ArrowRight, CheckCircle2, AlertTriangle, Clock3, Sparkles } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { TodaysActionsPanel } from '@/components/home/TodaysActionsPanel';
import { useTodaysActions } from '@/hooks/use-todays-actions';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';
import { PlansTab } from '@/components/planner/PlansTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type HomeTab = 'today' | 'opportunities' | 'plans';

interface TodayOverview {
  approvalsNeeded: number;
  repliesPending: number;
  preparedByPulse: number;
  needsAttention: number;
  contentGaps: number;
  scheduledNext14Days: number;
  draftsAwaitingApproval: number;
  lastAutopilotRun: {
    status: string;
    createdAt: string;
    itemsSaved: number;
    itemsFailed: number;
    copyOnlyFallbackUsed?: boolean;
    assetBlocked?: boolean;
    recommendedActions?: string[];
    sourceSummary?: Record<string, number>;
  } | null;
  nextPulseRunLabel: string | null;
}

export default function Home() {
  const { currentVenue } = useVenue();
  const { actions: todaysActions, isLoading: todaysLoading, markPosted } = useTodaysActions();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = useMemo<HomeTab>(() => {
    const tab = searchParams.get('tab');
    return tab === 'opportunities' || tab === 'plans' ? tab : 'today';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<HomeTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['home-today-overview', currentVenue?.id],
    queryFn: async (): Promise<TodayOverview | null> => {
      if (!currentVenue) return null;

      const now = new Date();
      const twoWeeksOut = new Date(now);
      twoWeeksOut.setDate(now.getDate() + 14);

      const [pendingReplies, pendingGuestPhotos, draftContent, scheduledContent, latestAutopilotRun, autopilotSettings] = await Promise.all([
        supabase
          .from('review_response_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id)
          .eq('status', 'pending'),
        supabase
          .from('guest_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id)
          .eq('status', 'pending'),
        supabase
          .from('content_items')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id)
          .eq('status', 'draft'),
        supabase
          .from('content_items')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id)
          .not('scheduled_for', 'is', null)
          .gte('scheduled_for', now.toISOString())
          .lt('scheduled_for', twoWeeksOut.toISOString()),
        supabase
          .from('autopilot_runs')
          .select('id, status, run_status, created_at, items_saved, items_failed, saved_count, failed_count, output_summary')
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

      const repliesPending = pendingReplies.count ?? 0;
      const guestApprovalsPending = pendingGuestPhotos.count ?? 0;
      const contentDrafts = draftContent.count ?? 0;
      const scheduledNext14Days = scheduledContent.count ?? 0;
      const draftsAwaitingApproval = repliesPending + contentDrafts;
      const approvalsNeeded = repliesPending + guestApprovalsPending;
      const preparedByPulse = repliesPending + contentDrafts;
      const needsAttention = approvalsNeeded + (todaysActions.filter((a) => a.due_state === 'overdue').length || 0);
      const contentGaps = Math.max(0, 14 - scheduledNext14Days);

      const settings = autopilotSettings.data;
      const nextPulseRunLabel = settings?.is_enabled
        ? describeNextRun(settings.frequency || '3x_week', settings.run_time || '09:00:00')
        : null;

      const run = latestAutopilotRun.data;

      return {
        approvalsNeeded,
        repliesPending,
        preparedByPulse,
        needsAttention,
        contentGaps,
        scheduledNext14Days,
        draftsAwaitingApproval,
        nextPulseRunLabel,
        lastAutopilotRun: run
          ? {
              status: run.run_status || run.status,
              createdAt: run.created_at,
              itemsSaved: run.saved_count ?? run.items_saved ?? 0,
              itemsFailed: run.failed_count ?? run.items_failed ?? 0,
              copyOnlyFallbackUsed: Boolean((run.output_summary as any)?.copy_only_fallback_used),
              assetBlocked: Boolean((run.output_summary as any)?.asset_blocked),
              recommendedActions: Array.isArray((run.output_summary as any)?.recommended_next_asset_actions)
                ? ((run.output_summary as any).recommended_next_asset_actions as any[]).map((action) => String(action))
                : [],
              sourceSummary: ((run.output_summary as any)?.source_summary || {}) as Record<string, number>,
            }
          : null,
      };
    },
    enabled: !!currentVenue,
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

  const formatRunTime = (timestamp: string) => new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title={`Command Centre${currentVenue ? ` • ${currentVenue.name}` : ''}`}
        description="Run reviews, content, approvals, and publishing from one weekly operating screen."
      />

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

        <TabsContent value="today" className="space-y-6">
          {overviewLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <OperatorCard
                title="Approvals needed"
                value={overview?.approvalsNeeded ?? 0}
                subtitle={`${overview?.repliesPending ?? 0} review replies waiting`}
                tone={(overview?.approvalsNeeded ?? 0) > 0 ? 'alert' : 'ok'}
                linkTo="/reputation/reviews?tab=respond"
                linkLabel="Open Reviews"
              />
              <OperatorCard
                title="Pulse prepared"
                value={overview?.preparedByPulse ?? 0}
                subtitle="Draft replies and content ready"
                tone="neutral"
                linkTo="/content/library"
                linkLabel="Open Content"
              />
              <OperatorCard
                title="Needs attention"
                value={overview?.needsAttention ?? 0}
                subtitle="Overdue tasks and pending approvals"
                tone={(overview?.needsAttention ?? 0) > 0 ? 'alert' : 'ok'}
                linkTo="/home"
                linkLabel="Review Today"
              />
              <OperatorCard
                title="Content gaps"
                value={overview?.contentGaps ?? 0}
                subtitle={`${overview?.scheduledNext14Days ?? 0} posts scheduled for next 14 days`}
                tone={(overview?.contentGaps ?? 0) > 0 ? 'warning' : 'ok'}
                linkTo="/content/calendar"
                linkLabel="Open Publishing"
              />
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Pulse activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!overview?.lastAutopilotRun ? (
                <p className="text-sm text-muted-foreground">Pulse is active in the background. Finish Automation Settings in Setup to start preparing content each week.</p>
              ) : (
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Pulse is active</p>
                    <p className="text-sm font-medium">
                      Last run: <span className="capitalize">{overview.lastAutopilotRun.status.replace('_', ' ')}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ran {formatRunTime(overview.lastAutopilotRun.createdAt)} • Generated {overview.lastAutopilotRun.itemsSaved} content item{overview.lastAutopilotRun.itemsSaved === 1 ? '' : 's'}
                      {overview.lastAutopilotRun.itemsFailed > 0 ? ` • ${overview.lastAutopilotRun.itemsFailed} failed` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Drafted {overview.draftsAwaitingApproval} replies/content items that may need approval.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {overview.nextPulseRunLabel ? `Next run: ${overview.nextPulseRunLabel}` : 'Next run: set cadence in Setup'}
                    </p>
                    {overview.lastAutopilotRun.assetBlocked && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Blocker: weak asset coverage. Add weekend-ready photos to strengthen Pulse output.
                      </p>
                    )}
                    {overview.lastAutopilotRun.copyOnlyFallbackUsed && !overview.lastAutopilotRun.assetBlocked && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Pulse can generate better content if you add 2 more approved dish photos.
                      </p>
                    )}
                    {overview.lastAutopilotRun.recommendedActions?.length ? (
                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                        {overview.lastAutopilotRun.recommendedActions.slice(0, 2).map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/setup?tab=automation">Automation settings</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <TodaysActionsPanel actions={todaysActions} loading={todaysLoading} onMarkPosted={markPosted} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What to do next</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 grid gap-2 md:grid-cols-2">
              <ActionLink to="/reputation/reviews?tab=respond" label="Clear the review reply queue" />
              <ActionLink to="/content/library" label="Check content Pulse prepared" />
              <ActionLink to="/content/calendar" label="Fill this week’s publishing gaps" />
              <ActionLink to="/setup" label="Confirm setup and approval rules" />
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

function OperatorCard({
  title,
  value,
  subtitle,
  linkTo,
  linkLabel,
  tone,
}: {
  title: string;
  value: number;
  subtitle: string;
  linkTo: string;
  linkLabel: string;
  tone: 'ok' | 'warning' | 'alert' | 'neutral';
}) {
  const toneStyles = {
    ok: 'border-emerald-500/25 bg-emerald-500/5',
    warning: 'border-amber-500/25 bg-amber-500/5',
    alert: 'border-destructive/30 bg-destructive/5',
    neutral: 'border-border bg-card',
  };

  return (
    <Card className={toneStyles[tone]}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="text-3xl font-semibold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {tone === 'alert' ? (
            <AlertTriangle className="w-4 h-4 text-destructive" />
          ) : tone === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Clock3 className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-0 mt-2 text-xs text-accent" asChild>
          <Link to={linkTo}>
            {linkLabel}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:border-accent/40 transition-colors">
      <span>{label}</span>
      <Badge variant="outline" className="text-[10px]">Open</Badge>
    </Link>
  );
}

function describeNextRun(frequency: string, runTime: string): string {
  const time = runTime.slice(0, 5);
  if (frequency === 'daily') return `Daily at ${time}`;
  if (frequency === '3x_week') return `3× weekly at ${time}`;
  if (frequency === 'weekly') return `Weekly at ${time}`;
  return `Scheduled at ${time}`;
}
