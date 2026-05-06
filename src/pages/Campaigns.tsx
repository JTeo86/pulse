import { motion } from 'framer-motion';
import { PageHeader } from '@/components/ui/page-header';
import { PlansTab } from '@/components/planner/PlansTab';

export default function CampaignsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Campaigns & Visibility"
        description="Coordinate campaigns, keep coverage consistent, and move approved work toward publishing."
      />
      <PlansTab />
    </motion.div>
  );
}
