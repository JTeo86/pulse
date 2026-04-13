import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plug } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function IntegrationsPage() {
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate('/setup')}>
          <ArrowLeft className="w-4 h-4" /> Back to Setup
        </Button>
      </div>

      <PageHeader
        title="Integrations"
        description="Buffer integration is temporarily paused while we restore stable rendering."
      />

      <div className="max-w-2xl card-elevated p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Plug className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-medium">Buffer</h3>
              <p className="text-sm text-muted-foreground">
                Connection flow is being finalized. This page now fails safely without requiring OAuth or edge functions.
              </p>
            </div>
          </div>
          <Badge variant="secondary">Coming soon</Badge>
        </div>

        <p className="text-sm text-muted-foreground">Buffer connection coming soon.</p>
      </div>
    </motion.div>
  );
}
