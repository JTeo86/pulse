import { motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/page-header';
import { OpportunitiesTab } from '@/components/planner/OpportunitiesTab';

export default function OpportunitiesPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Opportunities"
        description="Spot trading gaps, seasonal moments, and campaign opportunities before they are missed."
      />
      <OpportunitiesTab />
    </motion.div>
  );
}
