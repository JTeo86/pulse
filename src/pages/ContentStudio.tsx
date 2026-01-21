import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';
import { PenTool } from 'lucide-react';

export default function ContentStudioPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Content Studio"
        description="Create on-brand content across all formats"
      />

      <ComingSoonCard
        title="AI Content Generator"
        description="Generate blogs, social posts, emails, and ads that perfectly match your brand voice. Our AI understands your Brand Identity and creates content that sounds authentically you."
        icon={PenTool}
        features={[
          "Blog post generation with SEO optimization",
          "Social media captions for any platform",
          "Email copy that converts",
          "Ad creative and headlines",
          "Content repurposing across formats",
        ]}
      />
    </AppLayout>
  );
}
