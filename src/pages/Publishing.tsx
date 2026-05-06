import { motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/page-header';
import { InternalPublishingQueue } from '@/components/publishing/InternalPublishingQueue';

export default function PublishingPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Publishing"
        description="Approve, schedule, publish, and track venue visibility from one reliable queue."
      />
      <InternalPublishingQueue />
    </motion.div>
  );
}
