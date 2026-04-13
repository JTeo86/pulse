import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Link2Off, Loader2, Plug } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';

type BufferStatus = {
  connected: boolean;
  connection: {
    connected_at: string;
    buffer_user_id: string | null;
  } | null;
};

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<BufferStatus>({ connected: false, connection: null });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = async () => {
    if (!currentVenue) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('buffer-oauth?action=status&venue_id=' + currentVenue.id);
      if (error) throw error;
      setStatus((data ?? { connected: false, connection: null }) as BufferStatus);
    } catch (error: any) {
      toast({ title: 'Failed to load Buffer status', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [currentVenue?.id]);

  useEffect(() => {
    const bufferState = searchParams.get('buffer');
    if (bufferState === 'connected') {
      toast({ title: 'Buffer connected', description: 'Your venue can now send approved content to Buffer.' });
      loadStatus();
    }
  }, [searchParams]);

  const handleConnect = async () => {
    if (!currentVenue) return;
    setConnecting(true);
    try {
      const redirectTo = `${window.location.origin}/venue/integrations`;
      const { data, error } = await supabase.functions.invoke('buffer-oauth?action=start', {
        body: { venue_id: currentVenue.id, redirect_to: redirectTo },
      });
      if (error) throw error;
      if (!data?.auth_url) throw new Error('Missing Buffer authorization URL');
      window.location.assign(data.auth_url);
    } catch (error: any) {
      toast({ title: 'Could not start Buffer OAuth', description: error.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!currentVenue) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('buffer-oauth?action=disconnect', {
        body: { venue_id: currentVenue.id },
      });
      if (error) throw error;
      toast({ title: 'Buffer disconnected' });
      await loadStatus();
    } catch (error: any) {
      toast({ title: 'Could not disconnect Buffer', description: error.message, variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate('/setup')}>
          <ArrowLeft className="w-4 h-4" /> Back to Setup
        </Button>
      </div>

      <PageHeader
        title="Integrations"
        description="Connect Buffer once, then send approved content from Publishing in one click."
      />

      <div className="max-w-2xl card-elevated p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Plug className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-medium">Buffer</h3>
              <p className="text-sm text-muted-foreground">OAuth connection for sending approved posts to your Buffer channels.</p>
            </div>
          </div>

          {loading ? (
            <Badge variant="outline">Checking...</Badge>
          ) : status.connected ? (
            <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {status.connected && status.connection?.connected_at && (
          <p className="text-xs text-muted-foreground">
            Connected on {new Date(status.connection.connected_at).toLocaleString()}
          </p>
        )}

        <div className="flex gap-2">
          {!status.connected ? (
            <Button onClick={handleConnect} disabled={connecting || loading}>
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Connect Buffer
            </Button>
          ) : (
            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2Off className="w-4 h-4 mr-2" />}
              Disconnect
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
