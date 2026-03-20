import { motion } from 'framer-motion';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueHero } from '@/components/home/RevenueHero';
import { TodaysOpportunities } from '@/components/home/TodaysOpportunities';
import { TodaysActionsPanel } from '@/components/home/TodaysActionsPanel';
import { RecentActivity } from '@/components/home/RecentActivity';
import { ReferralHomeCards } from '@/components/home/ReferralHomeCards';
import { useTodaysActions } from '@/hooks/use-todays-actions';

export default function Home() {
  const { currentVenue } = useVenue();
  const { actions: todaysActions, isLoading: todaysLoading, markPosted } = useTodaysActions();

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

      {/* Referral Network Cards (conditional) */}
      <ReferralHomeCards />

      {/* Recent Activity */}
      <RecentActivity />
    </motion.div>
  );
}
