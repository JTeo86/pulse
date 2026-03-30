import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardList, Home as HomeIcon } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueHero } from '@/components/home/RevenueHero';
import { TodaysOpportunities } from '@/components/home/TodaysOpportunities';
import { TodaysActionsPanel } from '@/components/home/TodaysActionsPanel';
import { RecentActivity } from '@/components/home/RecentActivity';
import { ReferralHomeCards } from '@/components/home/ReferralHomeCards';
import { useTodaysActions } from '@/hooks/use-todays-actions';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';
import { PlansTab } from '@/components/planner/PlansTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type HomeTab = 'today' | 'opportunities' | 'plans';

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
        title={`Welcome back${currentVenue ? `, ${currentVenue.name}` : ''}`}
        description="Your command center for today’s execution, opportunities, and plans."
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="today" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <HomeIcon className="w-4 h-4" /> Today
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <CalendarDays className="w-4 h-4" /> Opportunities
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
            <ClipboardList className="w-4 h-4" /> Plans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-8">
          <RevenueHero />
          <TodaysActionsPanel actions={todaysActions} loading={todaysLoading} onMarkPosted={markPosted} />
          <TodaysOpportunities />
          <ReferralHomeCards />
          <RecentActivity />
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
