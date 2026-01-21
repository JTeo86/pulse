import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';
import { Target } from 'lucide-react';

export default function CompetitorIntelPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Competitor Intel"
        description="Analyze competitor strategies and stay ahead"
      />

      <ComingSoonCard
        title="Competitive Intelligence"
        description="Monitor your competitors' content strategies and discover opportunities to differentiate your brand. AI-powered analysis helps you understand what's working in your market."
        icon={Target}
        features={[
          "Competitor content monitoring",
          "Trend detection and analysis",
          "Content gap opportunities",
          "Performance benchmarking",
          "Strategic recommendations",
        ]}
      />
    </AppLayout>
  );
}
