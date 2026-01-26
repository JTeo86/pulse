import { useState } from 'react';
import { motion } from 'framer-motion';
import { PenTool, Info } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { CopywriterModule } from '@/components/copywriter/CopywriterModule';
import { RecentDrafts } from '@/components/copywriter/RecentDrafts';

export default function CopywriterPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleProjectSaved = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <AppLayout>
      <PageHeader
        title="Copywriter"
        description="AI-powered copy generation for email, blog, ads, and more"
      />

      <div className="space-y-8">
        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm text-foreground">
                    The Copywriter uses your <span className="font-medium text-accent">Brand Identity</span> and{' '}
                    <span className="font-medium text-accent">Brand Brief</span> to generate on-brand copy.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Set up your brand voice in Brand Identity → Rules & Tone for best results.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Drafts */}
        <RecentDrafts refreshTrigger={refreshTrigger} />

        {/* Module Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Create New Copy</h2>
          <CopywriterModule onProjectSaved={handleProjectSaved} />
        </motion.div>
      </div>
    </AppLayout>
  );
}
