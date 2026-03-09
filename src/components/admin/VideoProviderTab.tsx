import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Film,
  Key,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Info,
} from 'lucide-react';

interface ApiKeyRow {
  id: string;
  key_name: string;
  key_value: string;
  is_configured: boolean;
  health_status: string;
  description: string | null;
}

interface FlagRow {
  id: string;
  flag_key: string;
  is_enabled: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'outline' | 'secondary' | 'destructive'; icon: typeof CheckCircle2 }> = {
  healthy: { label: 'Ready', variant: 'outline', icon: CheckCircle2 },
  missing: { label: 'Not Configured', variant: 'secondary', icon: AlertTriangle },
  invalid: { label: 'Invalid', variant: 'destructive', icon: XCircle },
  untested: { label: 'Untested', variant: 'outline', icon: Info },
};

export default function VideoProviderTab() {
  const queryClient = useQueryClient();

  // Load Kling API keys
  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ['video-provider-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_api_keys')
        .select('*')
        .eq('category', 'Video');
      if (error) throw error;
      return (data || []) as ApiKeyRow[];
    },
  });

  // Load related feature flags
  const { data: flags, isLoading: flagsLoading } = useQuery({
    queryKey: ['video-provider-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, flag_key, is_enabled')
        .is('venue_id', null)
        .in('flag_key', [
          'feature.video_enabled',
          'feature.reel_creator_enabled',
          'feature.kling_provider_enabled',
        ]);
      if (error) throw error;
      return (data || []) as FlagRow[];
    },
  });

  const getFlag = (key: string) => flags?.find((f) => f.flag_key === key);
  const videoEnabled = getFlag('feature.video_enabled');
  const reelCreatorEnabled = getFlag('feature.reel_creator_enabled');
  const klingProviderEnabled = getFlag('feature.kling_provider_enabled');

  const klingApiKey = apiKeys?.find((k) => k.key_name === 'KLING_API_KEY');
  const klingApiSecret = apiKeys?.find((k) => k.key_name === 'KLING_API_SECRET');

  // Local state for key editing
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiSecretValue, setApiSecretValue] = useState('');

  const toggleFlagMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: isEnabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-provider-flags'] });
      queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
      queryClient.invalidateQueries({ queryKey: ['gallery-flags'] });
      queryClient.invalidateQueries({ queryKey: ['phase-flags'] });
      toast.success('Flag updated');
    },
    onError: (err) => toast.error('Failed: ' + err.message),
  });

  const saveKeyMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const trimmed = value.trim();
      const { error } = await supabase
        .from('platform_api_keys')
        .update({
          key_value: trimmed,
          is_configured: trimmed.length > 0,
          health_status: trimmed.length > 0 ? 'untested' : 'missing',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-provider-keys'] });
      setApiKeyValue('');
      setApiSecretValue('');
      toast.success('API key saved');
    },
    onError: (err) => toast.error('Failed to save: ' + err.message),
  });

  const isLoading = keysLoading || flagsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusInfo = STATUS_BADGE[klingApiKey?.health_status || 'missing'] || STATUS_BADGE.missing;
  const StatusIcon = statusInfo.icon;

  // Determine overall provider readiness
  const providerReady =
    videoEnabled?.is_enabled &&
    reelCreatorEnabled?.is_enabled &&
    klingProviderEnabled?.is_enabled &&
    klingApiKey?.is_configured;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Film className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <CardTitle>Video / Reel Creator</CardTitle>
              <CardDescription>
                Configure video generation for turning Pro Photos into reels.
              </CardDescription>
            </div>
            <Badge variant={providerReady ? 'outline' : 'secondary'} className={providerReady ? 'bg-success/10 text-success border-success/20' : ''}>
              {providerReady ? 'Ready' : 'Not Ready'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Feature Toggles */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Feature Gates
            </h4>

            <div className="space-y-3">
              {/* Video Enabled */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Video Features Enabled</p>
                  <p className="text-xs text-muted-foreground">Master switch for all video capabilities.</p>
                </div>
                <Switch
                  checked={videoEnabled?.is_enabled ?? false}
                  onCheckedChange={(checked) =>
                    videoEnabled && toggleFlagMutation.mutate({ id: videoEnabled.id, isEnabled: checked })
                  }
                  disabled={!videoEnabled || toggleFlagMutation.isPending}
                />
              </div>

              {/* Reel Creator Enabled */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Reel Creator Visible</p>
                  <p className="text-xs text-muted-foreground">
                    Shows Reel Creator in Studio nav and "Create Reel" in gallery.
                  </p>
                </div>
                <Switch
                  checked={reelCreatorEnabled?.is_enabled ?? false}
                  onCheckedChange={(checked) =>
                    reelCreatorEnabled && toggleFlagMutation.mutate({ id: reelCreatorEnabled.id, isEnabled: checked })
                  }
                  disabled={!reelCreatorEnabled || toggleFlagMutation.isPending}
                />
              </div>

              {/* Kling Provider */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Kling Provider Enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Allow reel jobs to be sent to Kling AI for processing.
                  </p>
                </div>
                <Switch
                  checked={klingProviderEnabled?.is_enabled ?? false}
                  onCheckedChange={(checked) =>
                    klingProviderEnabled && toggleFlagMutation.mutate({ id: klingProviderEnabled.id, isEnabled: checked })
                  }
                  disabled={!klingProviderEnabled || toggleFlagMutation.isPending}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Provider Config */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Kling Provider Configuration
              </h4>
              <Badge variant={statusInfo.variant} className="text-xs gap-1">
                <StatusIcon className="w-3 h-3" />
                {statusInfo.label}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="kling-api-key">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="kling-api-key"
                    type="password"
                    placeholder={klingApiKey?.is_configured ? '••••••••••••' : 'Paste your Kling API key'}
                    value={apiKeyValue}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    disabled={!apiKeyValue.trim() || !klingApiKey || saveKeyMutation.isPending}
                    onClick={() => klingApiKey && saveKeyMutation.mutate({ id: klingApiKey.id, value: apiKeyValue })}
                  >
                    {saveKeyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kling-api-secret">API Secret (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="kling-api-secret"
                    type="password"
                    placeholder={klingApiSecret?.is_configured ? '••••••••••••' : 'Paste your Kling API secret'}
                    value={apiSecretValue}
                    onChange={(e) => setApiSecretValue(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    disabled={!apiSecretValue.trim() || !klingApiSecret || saveKeyMutation.isPending}
                    onClick={() => klingApiSecret && saveKeyMutation.mutate({ id: klingApiSecret.id, value: apiSecretValue })}
                  >
                    {saveKeyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Helper Text */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <h5 className="text-sm font-medium flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              Setup Guide
            </h5>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Reel Creator is currently hidden from venue users until both <strong>Video Features</strong> and <strong>Reel Creator Visible</strong> are enabled.</li>
              <li>Kling API credentials can be added at any time. Jobs queued before provider setup will be held in pending state.</li>
              <li>If provider config is missing when a user tries to create a reel, they'll see a clean "provider not configured" message.</li>
              <li>Enable <strong>Kling Provider</strong> only after API credentials are saved and tested.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
