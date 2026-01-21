import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';
import { Brain } from 'lucide-react';

export default function AIInsightsPage() {
  return (
    <AppLayout>
      <PageHeader
        title="AI Insights"
        description="Brand-aware AI recommendations"
      />

      <ComingSoonCard
        title="Intelligent Brand Advisor"
        description="Get personalized recommendations to strengthen your brand. Our AI analyzes your content, audience, and market to provide actionable insights."
        icon={Brain}
        features={[
          "Content strategy recommendations",
          "Brand voice consistency analysis",
          "Optimal posting time suggestions",
          "Audience engagement tips",
          "Growth opportunity detection",
        ]}
      />
    </AppLayout>
  );
}
