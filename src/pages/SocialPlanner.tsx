import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';
import { Calendar } from 'lucide-react';

export default function SocialPlannerPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Social Planner"
        description="Plan and schedule your social media content"
      />

      <ComingSoonCard
        title="Visual Content Calendar"
        description="Plan your social media presence with a beautiful calendar view. See all your scheduled content at a glance and maintain a consistent posting rhythm."
        icon={Calendar}
        features={[
          "Drag-and-drop content scheduling",
          "Multi-platform preview",
          "Best time to post recommendations",
          "Content gaps detection",
          "Campaign planning tools",
        ]}
      />
    </AppLayout>
  );
}
