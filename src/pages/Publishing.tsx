import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function PublishingPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Publishing"
        description="Publishing is intentionally paused while Buffer publishing is finalized."
      />
      <div className="card-elevated p-6">
        <EmptyState
          icon={Send}
          title="Publishing paused for stability"
          description="Buffer publishing is being finalized. Send actions stay disabled in this environment until rollout is complete."
        />
      </div>
    </motion.div>
  );
}
