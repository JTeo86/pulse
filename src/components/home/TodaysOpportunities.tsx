import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import {
  MessageSquareText,
  Camera,
  CalendarCheck,
  Receipt,
  Wallet,
  Gift,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface Opportunity {
  key: string;
  icon: any;
  title: string;
  description: string;
  count: number;
  route: string;
  actionLabel: string;
  priority: 'high' | 'medium' | 'low';
}

export function TodaysOpportunities() {
  const { currentVenue } = useVenue();
  const { venueHasAccess } = useReferralAccess();

  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['todays-opportunities', currentVenue?.id, venueHasAccess],
    queryFn: async () => {
      if (!currentVenue) return [];

      const queries = await Promise.all([
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
          .from('marketing_plans')
          .select('plan_data')
          .eq('venue_id', currentVenue.id)
          .eq('status', 'draft')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('content_items')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id)
          .eq('status', 'draft'),
        venueHasAccess
          ? supabase
              .from('referral_bookings')
              .select('*', { count: 'exact', head: true })
              .eq('venue_id', currentVenue.id)
              .eq('spend_verified', false)
              .in('booking_status', ['attended', 'confirmed'])
          : Promise.resolve({ count: 0 }),
        venueHasAccess
          ? supabase
              .from('payout_batches')
              .select('*', { count: 'exact', head: true })
              .eq('venue_id', currentVenue.id)
              .eq('status', 'pending_approval')
          : Promise.resolve({ count: 0 }),
      ]);

      const [reviews, guestContent, marketingPlan, drafts, billVerify, payouts] = queries;

      const pendingPlanTasks = marketingPlan?.data?.plan_data
        ? (marketingPlan.data.plan_data as any[]).filter(
            (t: any) => t.status === 'pending'
          ).length
        : 0;

      const items: Opportunity[] = [];

      if ((reviews.count ?? 0) > 0) {
        items.push({
          key: 'reviews',
          icon: MessageSquareText,
          title: `Respond to ${reviews.count} review${(reviews.count ?? 0) > 1 ? 's' : ''}`,
          description: 'Pending reviews need your attention',
          count: reviews.count ?? 0,
          route: '/reputation/reviews',
          actionLabel: 'Respond',
          priority: 'high',
        });
      }

      if ((guestContent.count ?? 0) > 0) {
        items.push({
          key: 'guest',
          icon: Camera,
          title: `Approve ${guestContent.count} guest photo${(guestContent.count ?? 0) > 1 ? 's' : ''}`,
          description: 'Guest submissions waiting for review',
          count: guestContent.count ?? 0,
          route: '/venue/guest-photos',
          actionLabel: 'Review',
          priority: 'medium',
        });
      }

      if (pendingPlanTasks > 0) {
        items.push({
          key: 'marketing',
          icon: CalendarCheck,
          title: `Approve ${pendingPlanTasks} marketing task${pendingPlanTasks > 1 ? 's' : ''}`,
          description: 'Weekly marketing plan tasks pending',
          count: pendingPlanTasks,
          route: '/home',
          actionLabel: 'Review Plan',
          priority: 'medium',
        });
      }

      if ((drafts.count ?? 0) > 0) {
        items.push({
          key: 'drafts',
          icon: CalendarCheck,
          title: `Schedule ${drafts.count} draft${(drafts.count ?? 0) > 1 ? 's' : ''}`,
          description: 'Content ready to be scheduled',
          count: drafts.count ?? 0,
          route: '/content/scheduler',
          actionLabel: 'Schedule',
          priority: 'low',
        });
      }

      if ((billVerify.count ?? 0) > 0) {
        items.push({
          key: 'bills',
          icon: Receipt,
          title: `Verify ${billVerify.count} referral bill${(billVerify.count ?? 0) > 1 ? 's' : ''}`,
          description: 'Bills awaiting spend verification',
          count: billVerify.count ?? 0,
          route: '/growth/referrals',
          actionLabel: 'Verify',
          priority: 'high',
        });
      }

      if ((payouts.count ?? 0) > 0) {
        items.push({
          key: 'payouts',
          icon: Wallet,
          title: `Approve ${payouts.count} payout batch${(payouts.count ?? 0) > 1 ? 'es' : ''}`,
          description: 'Payout batches awaiting approval',
          count: payouts.count ?? 0,
          route: '/growth/payouts',
          actionLabel: 'Approve',
          priority: 'high',
        });
      }

      return items;
    },
    enabled: !!currentVenue,
  });

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Today's Opportunities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!opportunities?.length) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Today's Opportunities
        </h2>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-6">
            <CheckCircle2 className="w-8 h-8 text-accent shrink-0" />
            <div>
              <p className="font-medium text-sm">All caught up!</p>
              <p className="text-xs text-muted-foreground">
                No immediate actions needed. Keep creating great content.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const PRIORITY_BORDER: Record<string, string> = {
    high: 'border-l-destructive',
    medium: 'border-l-warning',
    low: 'border-l-muted-foreground',
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Today's Opportunities
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {opportunities.map((opp) => (
          <Card
            key={opp.key}
            className={`group border-l-4 ${PRIORITY_BORDER[opp.priority] || ''} hover:border-accent/50 transition-colors`}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <opp.icon className="w-4.5 h-4.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{opp.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opp.description}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2 text-xs text-accent hover:text-accent gap-1"
                  asChild
                >
                  <Link to={opp.route}>
                    {opp.actionLabel}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
