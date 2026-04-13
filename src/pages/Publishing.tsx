import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function PublishingPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Publishing"
        description="Publishing is temporarily in safe mode while Buffer connection is stabilized."
      />
      <div className="card-elevated p-6">
        <EmptyState
          icon={Send}
          title="Buffer connection coming soon"
          description="The publishing queue is temporarily paused to keep the app stable."
        />
      </div>
    </motion.div>
  );
}
