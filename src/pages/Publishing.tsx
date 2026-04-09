import { motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { InternalPublishingQueue } from '@/components/publishing/InternalPublishingQueue';

export default function PublishingPage() {
  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Publishing"
          description="Final execution layer for approved content: schedule it, export it, and close the loop when it is published."
        />
        <InternalPublishingQueue />
      </motion.div>
    </AppLayout>
  );
}
