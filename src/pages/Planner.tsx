import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';
import { PlansTab } from '@/components/planner/PlansTab';

export default function PlannerPage() {
  const [activeTab, setActiveTab] = useState('opportunities');

  return (
    <>
      <PageHeader
        title="Planner"
        description="Spot opportunities. Build plans. Execute campaigns."
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/30 border border-border/50">
            <TabsTrigger value="opportunities" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
              <CalendarDays className="w-4 h-4" /> Opportunities
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
              <ClipboardList className="w-4 h-4" /> Plans
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities">
            <OpportunitiesTab />
          </TabsContent>

          <TabsContent value="plans">
            <PlansTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
}
