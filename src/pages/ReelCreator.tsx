import { motion } from 'framer-motion';
import { Film, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoonCard } from '@/components/ui/coming-soon-card';

export default function ReelCreator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title="Reel Creator"
        description="Transform your dish photos into scroll-stopping video content."
      />

      <ComingSoonCard
        icon={Film}
        title="Video Generation Coming Soon"
        description="Turn your Pro Photos into engaging Reels and Stories. Upload a dish photo, add a hook, and let the AI create motion content optimized for Instagram and TikTok."
        features={[
          'One-click video from static images',
          'Auto-generated captions and hooks',
          'Multiple aspect ratios (9:16, 1:1, 16:9)',
          'Trending audio suggestions',
        ]}
      />
    </motion.div>
  );
}
