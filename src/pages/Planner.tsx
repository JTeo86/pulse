import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Megaphone, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';
import { CampaignsTab } from '@/components/planner/CampaignsTab';
import { CopyTab } from '@/components/planner/CopyTab';

export default function PlannerPage() {
  const [activeTab, setActiveTab] = useState('opportunities');
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Planner"
        description="Plan campaigns, seize opportunities, and create compelling copy — all in one place."
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
            <TabsTrigger value="campaigns" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
              <Megaphone className="w-4 h-4" /> Campaigns
            </TabsTrigger>
            <TabsTrigger value="copy" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
              <FileText className="w-4 h-4" /> Copy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities">
            <OpportunitiesTab onCreateCampaign={() => setActiveTab('campaigns')} />
          </TabsContent>

          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>

          <TabsContent value="copy">
            <CopyTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
}
