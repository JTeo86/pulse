import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Plug } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useVenue } from '@/lib/venue-context';

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const { isOwner } = useVenue();

  if (!isOwner) {
    return (
      <div className="max-w-xl space-y-6">
        <PageHeader title="Integrations" description="Owner-only area" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Owner access required</CardTitle>
            <CardDescription>Only the venue owner can manage publishing integrations.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate('/setup')}>
          <ArrowLeft className="w-4 h-4" /> Back to Setup
        </Button>
      </div>

      <PageHeader
        title="Integrations"
        description="Buffer publishing is being finalized. This area is intentionally paused for stability."
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
                The Buffer connection flow is under final hardening. We have paused new connections so publishing remains predictable.
              </p>
            </div>
          </div>
          <Badge variant="secondary">Temporarily paused</Badge>
        </div>

        <p className="text-sm text-muted-foreground">No action is required right now. Publishing remains paused until the Buffer rollout is completed.</p>
      </div>
    </motion.div>
  );
}
