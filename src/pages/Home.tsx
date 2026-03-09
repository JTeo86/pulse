import { motion } from 'framer-motion';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueHero } from '@/components/home/RevenueHero';
import { TodaysOpportunities } from '@/components/home/TodaysOpportunities';
import { WeeklyMarketingPlan } from '@/components/home/WeeklyMarketingPlan';
import { TopPerformingContent } from '@/components/home/TopPerformingContent';
import { IndustryInsight } from '@/components/home/IndustryInsight';
import { ReferralHomeCards } from '@/components/home/ReferralHomeCards';
import { RecentActivity } from '@/components/home/RecentActivity';
import { ActionFeed } from '@/components/home/ActionFeed';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActionItem {
  id: string;
  action_type: string;
  priority: string;
  title: string;
  description: string;
  cta_label: string;
  cta_route: string;
  status: string;
  created_at: string;
}

export default function Home() {
  const { currentVenue } = useVenue();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);

  useEffect(() => {
    if (!currentVenue) return;
    const fetchActions = async () => {
      setActionsLoading(true);
      const { data } = await supabase
        .from('action_feed_items')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .eq('status', 'open')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(6);
      setActions((data as ActionItem[]) || []);
      setActionsLoading(false);
    };
    fetchActions();
  }, [currentVenue]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <PageHeader
        title={`Welcome back${currentVenue ? `, ${currentVenue.name}` : ''}`}
        description="Your daily command center — see what needs attention and take action."
      />

      {/* Revenue Hero */}
      <RevenueHero />

      {/* Today's Opportunities */}
      <TodaysOpportunities />

      {/* Action Feed */}
      <ActionFeed actions={actions} loading={actionsLoading} onActionsChange={setActions} />

      {/* Weekly Marketing Plan */}
      <WeeklyMarketingPlan />

      {/* Top Performing Content */}
      <TopPerformingContent />

      {/* Referral Network Cards (conditional) */}
      <ReferralHomeCards />

      {/* Industry Insight */}
      <IndustryInsight />

      {/* Recent Activity */}
      <RecentActivity />
    </motion.div>
  );
}
