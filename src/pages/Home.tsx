import { motion } from 'framer-motion';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueHero } from '@/components/home/RevenueHero';
import { TodaysOpportunities } from '@/components/home/TodaysOpportunities';
import { TodaysActionsPanel } from '@/components/home/TodaysActionsPanel';
import { ActionFeed } from '@/components/home/ActionFeed';
import { RecentActivity } from '@/components/home/RecentActivity';
import { ReferralHomeCards } from '@/components/home/ReferralHomeCards';
import { useTodaysActions } from '@/hooks/use-todays-actions';
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
  const { actions: todaysActions, isLoading: todaysLoading, markPosted } = useTodaysActions();
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

      {/* Revenue Snapshot */}
      <RevenueHero />

      {/* Today's Actions — posting reminders from campaigns */}
      <TodaysActionsPanel
        actions={todaysActions}
        loading={todaysLoading}
        onMarkPosted={markPosted}
      />

      {/* Today's Opportunities — reviews, approvals, verifications */}
      <TodaysOpportunities />

      {/* Pulse Action Feed */}
      <ActionFeed actions={actions} loading={actionsLoading} onActionsChange={setActions} />

      {/* Referral Network Cards (conditional) */}
      <ReferralHomeCards />

      {/* Recent Activity */}
      <RecentActivity />
    </motion.div>
  );
}
