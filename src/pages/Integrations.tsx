import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Plug, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BufferChannel {
  id: string;
  service: string;
  service_username: string;
  formatted_username: string;
}

function getErrorMessage(error: any) {
  return error?.context?.error?.message || error?.message || 'Unknown error';
}

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const { currentVenue, isOwner, currentMember } = useVenue();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshingChannels, setRefreshingChannels] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [channels, setChannels] = useState<BufferChannel[]>([]);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  const role = (currentMember?.role || '').toLowerCase();
  const canManage = useMemo(() => isOwner || role === 'admin' || role === 'venue_admin', [isOwner, role]);

  const loadStatus = async () => {
    if (!currentVenue) return;
    const { data, error } = await supabase.functions.invoke(`buffer-oauth?action=status&venue_id=${currentVenue.id}`);
    if (error) throw error;

    setConnected(Boolean(data?.connected));
    setConnectedAt(data?.connection?.connected_at ?? null);
  };

  const loadChannels = async () => {
    if (!currentVenue) return;
    setChannelsError(null);

    const { data, error } = await supabase.functions.invoke(`buffer-oauth?action=channels&venue_id=${currentVenue.id}`);
    if (error) {
      setChannels([]);
      setChannelsError(getErrorMessage(error));
      return;
    }

    setConnected(Boolean(data?.connected));
    setChannels(Array.isArray(data?.channels) ? data.channels : []);
  };

  const refreshAll = async () => {
    if (!currentVenue) return;
    setLoading(true);
    try {
      await loadStatus();
      await loadChannels();
    } catch (error: any) {
      toast({ title: 'Failed to load Buffer integration', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, [currentVenue?.id]);

  const connectBuffer = async () => {
    if (!currentVenue || !canManage) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('buffer-oauth?action=start', {
        body: {
          venue_id: currentVenue.id,
          redirect_to: `${window.location.origin}/venue/integrations`,
        },
      });

      if (error) throw error;
      if (!data?.auth_url) throw new Error('Missing Buffer auth URL.');

      window.location.assign(String(data.auth_url));
    } catch (error: any) {
      toast({ title: 'Could not start Buffer connection', description: getErrorMessage(error), variant: 'destructive' });
      setConnecting(false);
    }
  };

  const disconnectBuffer = async () => {
    if (!currentVenue || !canManage) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('buffer-oauth?action=disconnect', {
        body: { venue_id: currentVenue.id },
      });

      if (error) throw error;
      toast({ title: 'Buffer disconnected' });
      await refreshAll();
    } catch (error: any) {
      toast({ title: 'Failed to disconnect Buffer', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!currentVenue) {
    return (
      <div className="max-w-xl space-y-6">
        <PageHeader title="Integrations" description="Select a venue to manage integrations." />
      </div>
    );
  }

  if (loading) {
    return <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
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
        description="Connect Buffer to enable direct publishing from Pulse."
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
                Connect Buffer once, then publish approved content directly from Pulse.
              </p>
            </div>
          </div>
          <Badge variant={connected ? 'default' : 'secondary'}>{connected ? 'Connected' : 'Not connected'}</Badge>
        </div>

        {connectedAt ? <p className="text-xs text-muted-foreground">Connected on {new Date(connectedAt).toLocaleString()}</p> : null}

        {!canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Lock className="w-4 h-4" /> Admin access required</CardTitle>
              <CardDescription>Members can view status and channels. Only venue owner/admin can connect or disconnect.</CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button onClick={connectBuffer} disabled={!canManage || connecting}>
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
              Connect Buffer
            </Button>
          ) : (
            <Button variant="destructive" onClick={disconnectBuffer} disabled={!canManage || disconnecting}>
              {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unplug className="w-4 h-4 mr-2" />}
              Disconnect Buffer
            </Button>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              setRefreshingChannels(true);
              try {
                await loadChannels();
              } finally {
                setRefreshingChannels(false);
              }
            }}
            disabled={refreshingChannels}
          >
            {refreshingChannels ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh channels
          </Button>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">Available Buffer channels</p>
          {!connected ? (
            <p className="text-sm text-muted-foreground">Connect Buffer to load channels.</p>
          ) : channelsError ? (
            <p className="text-sm text-destructive">Could not fetch channels: {channelsError}</p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels found on this Buffer account.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {channels.map((channel) => (
                <div key={channel.id} className="rounded border p-2 text-sm">
                  <p className="font-medium">{channel.service}</p>
                  <p className="text-muted-foreground">{channel.formatted_username || channel.service_username}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
