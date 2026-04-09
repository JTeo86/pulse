import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

export default function IntegrationsPage() {
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="mb-2">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate('/setup')}>
          <ArrowLeft className="w-4 h-4" /> Back to Setup
        </Button>
      </div>

      <PageHeader
        title="Publishing Operations"
        description="Pulse currently runs an internal publishing queue and export workflow. External scheduler adapters can be added later."
      />

      <div className="max-w-2xl space-y-6">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-accent/5 border border-accent/20">
          <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Current Mode: Internal Queue + Export</p>
            <p className="text-sm text-muted-foreground mt-1">
              Pulse manages publishing status internally (ready, queued, scheduled, exported, published, failed).
              You can export a publish pack and complete posting in your social scheduler.
            </p>
          </div>
        </div>

        <div className="card-elevated p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Download className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-medium">Operational Publish Pack Export</h3>
              <p className="text-sm text-muted-foreground">Export caption + media from Publishing Queue with audit history</p>
            </div>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground list-none">
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>Approve content in Drafts</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>Add it to Queue from Publishing</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>Set scheduled time (optional)</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>Export caption + media pack and post via your scheduler</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>Mark published in Pulse to close the loop</li>
          </ol>
        </div>

        <div className="card-elevated p-6">
          <h3 className="font-medium">Future Integrations</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Pulse uses an adapter-ready publishing architecture. Native scheduler integrations can be enabled later without changing this internal queue workflow.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          API keys for integrations are managed by platform admins in{' '}
          <span className="font-medium text-foreground">Admin → Integrations & API Keys</span>.
        </p>
      </div>
    </motion.div>
  );
}
