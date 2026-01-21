import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';
import { BarChart3 } from 'lucide-react';

export default function BrandPerformancePage() {
  return (
    <AppLayout>
      <PageHeader
        title="Brand Performance"
        description="Track your brand's content performance"
      />

      <ComingSoonCard
        title="Performance Analytics"
        description="Understand how your content is performing across all channels. Get actionable insights to improve engagement and grow your brand's reach."
        icon={BarChart3}
        features={[
          "Cross-platform analytics dashboard",
          "Engagement metrics and trends",
          "Content performance scoring",
          "Audience growth tracking",
          "ROI measurement tools",
        ]}
      />
    </AppLayout>
  );
}
