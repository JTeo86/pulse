import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarRange,
  Clock3,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard';
import { useCommandCentre } from '@/hooks/use-command-centre';

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-destructive/20 bg-destructive/5 text-destructive',
  medium: 'border-warning/20 bg-warning/5 text-warning',
  low: 'border-border bg-muted/20 text-muted-foreground',
};

export default function Home() {
  const { data, isLoading } = useCommandCentre();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Command Centre"
        description="Pulse prepares the work, flags the risks, and surfaces the next commercial actions across reputation, visibility, publishing, and referrals."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          icon={Clock3}
          label="Approvals Needed"
          value={isLoading ? '—' : String(data?.approvals.length ?? 0)}
          detail="Reply, campaign, publishing, and referral decisions"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Urgent Review Risk"
          value={isLoading ? '—' : String(data?.reputation.urgentNegativeReviews ?? 0)}
          detail="Low-rating reviews still waiting on action"
        />
        <SummaryCard
          icon={CalendarRange}
          label="Days Covered Ahead"
          value={isLoading ? '—' : String(data?.visibility.daysCoveredAhead ?? 0)}
          detail="Upcoming visibility already planned"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Open Opportunities"
          value={isLoading ? '—' : String(data?.opportunities.filter((item) => item.status === 'open').length ?? 0)}
          detail="Commercial signals worth acting on now"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Approvals Needed"
          description="Clear the queue where Pulse has already prepared work."
          actionLabel="Open Publishing"
          actionTo="/publishing"
        >
          {isLoading ? (
            <SectionSkeleton />
          ) : data?.approvals.length ? (
            <div className="space-y-3">
              {data.approvals.map((item) => (
                <ActionRow
                  key={item.id}
                  title={item.title}
                  reason={item.reason}
                  status={item.status}
                  priority={item.priority}
                  ctaLabel={item.ctaLabel}
                  ctaTo={item.ctaTo}
                />
              ))}
            </div>
          ) : (
            <EmptyMessage message="Nothing is waiting for approval right now. Pulse will add items here as review replies, campaign drafts, publish items, or referral checks are prepared." />
          )}
        </SectionCard>

        <SectionCard
          title="Reputation Snapshot"
          description="Review risk, reply coverage, and the themes emerging from guest feedback."
          actionLabel="Open Reputation"
          actionTo="/reputation/reviews?tab=inbox"
        >
          {isLoading ? (
            <SectionSkeleton />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label="Reviews needing reply" value={String(data?.reputation.pendingReplies ?? 0)} />
              <StatTile label="Urgent negative reviews" value={String(data?.reputation.urgentNegativeReviews ?? 0)} tone="danger" />
              <StatTile label="Recurring complaints" value={data?.reputation.recurringComplaintTheme || 'No recurring complaint trend'} />
              <StatTile label="Recurring praise" value={data?.reputation.recurringPraiseTheme || 'No recurring praise trend'} tone="positive" />
              <StatTile label="Response coverage" value={data?.reputation.responseCoverageLabel ?? 'No review data yet'} />
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Visibility Coverage"
          description="See where the next two weeks are exposed before revenue windows pass by."
          actionLabel="Open Campaigns"
          actionTo="/campaigns"
        >
          {isLoading ? (
            <SectionSkeleton />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatTile label="Days covered ahead" value={String(data?.visibility.daysCoveredAhead ?? 0)} />
                <StatTile label="Stale campaigns" value={String(data?.visibility.staleCampaignCount ?? 0)} />
                <StatTile
                  label="Recent asset signal"
                  value={data?.visibility.noRecentAssetSignal ? 'Needs refresh' : 'Healthy'}
                  tone={data?.visibility.noRecentAssetSignal ? 'warning' : 'positive'}
                />
              </div>
              {data?.visibility.missingTradingPeriods.length ? (
                <div className="space-y-2">
                  {data.visibility.missingTradingPeriods.map((item) => (
                    <div key={item} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyMessage message="No major visibility gaps detected in the next two weeks." />
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Revenue Opportunities"
          description="Commercial opportunities from review signals, coverage gaps, events, and referrals."
          actionLabel="Open Opportunities"
          actionTo="/opportunities"
        >
          {isLoading ? <SectionSkeleton /> : <OpportunityBoard opportunities={data?.opportunities ?? []} compact />}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Pulse Activity"
          description="What Pulse has already prepared or detected across the operating system."
          actionLabel="Open Command Centre"
          actionTo="/command-centre"
        >
          {isLoading ? (
            <SectionSkeleton />
          ) : (
            <div className="space-y-3">
              {data?.activity.map((item) => (
                <ActionRow
                  key={item.id}
                  title={item.title}
                  reason={item.reason}
                  status={item.status}
                  ctaLabel={item.ctaLabel}
                  ctaTo={item.ctaTo}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Asset Requests"
          description="Simple asset asks that support campaigns without turning Pulse into a generation tool."
          actionLabel="Open Assets"
          actionTo="/assets"
        >
          {isLoading ? (
            <SectionSkeleton />
          ) : data?.assetTasks.length ? (
            <div className="space-y-3">
              {data.assetTasks.map((task) => (
                <ActionRow
                  key={task.id}
                  title={task.title}
                  reason={task.description}
                  status="Needs upload"
                  ctaLabel={task.ctaLabel}
                  ctaTo={task.ctaTo}
                />
              ))}
            </div>
          ) : (
            <EmptyMessage message="No specific asset request is blocking the current campaign cycle." />
          )}
        </SectionCard>
      </div>
    </motion.div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  description,
  actionLabel,
  actionTo,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to={actionTo}>
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ActionRow({
  title,
  reason,
  status,
  ctaLabel,
  ctaTo,
  priority,
}: {
  title: string;
  reason: string;
  status: string;
  ctaLabel: string;
  ctaTo: string;
  priority?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            <Badge variant="outline" className="text-xs">
              {status}
            </Badge>
            {priority ? (
              <Badge variant="outline" className={`text-xs capitalize ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.low}`}>
                {priority}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{reason}</p>
        </div>
        <Button size="sm" asChild>
          <Link to={ctaTo}>{ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'border-border bg-muted/15',
    positive: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    danger: 'border-destructive/20 bg-destructive/5',
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
    </div>
  );
}
