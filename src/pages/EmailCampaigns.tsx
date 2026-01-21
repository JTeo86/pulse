import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';
import { Mail } from 'lucide-react';

export default function EmailCampaignsPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Email Campaigns"
        description="Create and manage brand-consistent email campaigns"
      />

      <ComingSoonCard
        title="Email Campaign Builder"
        description="Design beautiful emails that match your brand identity. From newsletters to promotional campaigns, create emails that engage your audience."
        icon={Mail}
        features={[
          "Visual email builder with brand templates",
          "AI-powered subject line optimization",
          "Audience segmentation",
          "A/B testing capabilities",
          "Performance analytics dashboard",
        ]}
      />
    </AppLayout>
  );
}
