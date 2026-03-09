import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Flag, Video, Image, Zap, Package, FlaskConical, Film } from 'lucide-react';

interface FeatureFlag {
  id: string;
  venue_id: string | null;
  flag_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
}

// Only operational flags — no duplication of product_phase logic or unused keys
const FLAG_INFO: Record<string, {
  name: string;
  description: string;
  safeDefault: string;
  impact: string;
  icon: typeof Flag;
  isPhaseControl?: boolean;
}> = {
  product_phase: {
    name: 'Product Phase',
    description: 'Controls which features are available platform-wide. Phase 1 = copy + images only. Phase 2 = video unlocked.',
    safeDefault: 'phase_1',
    impact: 'Flipping to phase_2 enables video/reel output for all users.',
    icon: Package,
    isPhaseControl: true,
  },
  'feature.video_enabled': {
    name: 'Video / Reels',
    description: 'Enable video reel output mode. Only active when product_phase = phase_2.',
    safeDefault: 'off',
    impact: 'Unlocks Reel tab in Editor for all users (requires phase_2).',
    icon: Video,
  },
  'feature.reel_creator_enabled': {
    name: 'Reel Creator Visible',
    description: 'Shows Reel Creator in Studio nav and "Create Reel" buttons in gallery. Requires video_enabled.',
    safeDefault: 'off',
    impact: 'Users can see Reel Creator page and gallery actions.',
    icon: Film,
  },
  'feature.kling_enabled': {
    name: 'Kling Cinematic AI Reels',
    description: 'Enable Kling-powered AI video generation. Requires video_enabled + phase_2.',
    safeDefault: 'off',
    impact: 'Unlocks Cinematic AI Reel option in Editor (requires KLING_API_KEY configured).',
    icon: Zap,
  },
  'feature.kling_provider_enabled': {
    name: 'Kling Provider Active',
    description: 'Allow reel jobs to be sent to Kling for processing. Requires KLING_API_KEY.',
    safeDefault: 'off',
    impact: 'Reel jobs will call Kling API when enabled.',
    icon: Zap,
  },
  'style_auto_improve_enabled': {
    name: 'Style Auto-Improve',
    description: 'Automatically re-analyse style assets when new uploads are added.',
    safeDefault: 'on',
    impact: 'Disabling stops automatic style profile updates.',
    icon: Image,
  },
};

// Flags to show, in order
const FLAG_ORDER = [
  'product_phase',
  'feature.video_enabled',
  'feature.reel_creator_enabled',
  'feature.kling_enabled',
  'feature.kling_provider_enabled',
  'style_auto_improve_enabled',
  'experimental_features',
];

export default function FeatureFlagsTab() {
  const queryClient = useQueryClient();

  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .is('venue_id', null)
        .order('flag_key');
      if (error) throw error;
      return data as FeatureFlag[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { error } = await supabase.from('feature_flags').update({ is_enabled: isEnabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
      queryClient.invalidateQueries({ queryKey: ['phase-flags'] });
      toast.success('Feature flag updated');
    },
    onError: (err) => toast.error('Failed to update flag: ' + err.message),
  });

  const updatePhaseMutation = useMutation({
    mutationFn: async ({ id, phase }: { id: string; phase: string }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ config_json: { value: phase, description: `Current product phase: ${phase}` } })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
      queryClient.invalidateQueries({ queryKey: ['phase-flags'] });
      toast.success('Product phase updated — refresh any open tabs');
    },
    onError: (err) => toast.error('Failed to update phase: ' + err.message),
  });

  // Order flags: known ones first, unknowns appended
  const knownFlags = FLAG_ORDER
    .map(key => flags?.find(f => f.flag_key === key))
    .filter(Boolean) as FeatureFlag[];
  const unknownFlags = (flags ?? []).filter(f => !FLAG_ORDER.includes(f.flag_key));
  const orderedFlags = [...knownFlags, ...unknownFlags];

  const renderRow = (flag: FeatureFlag) => {
    const info = FLAG_INFO[flag.flag_key] ?? {
      name: flag.flag_key,
      description: (flag.config_json as { description?: string })?.description ?? 'No description',
      safeDefault: '—',
      impact: 'Unknown impact.',
      icon: Flag,
    };
    const Icon = info.icon;
    const isPhaseControl = (info as { isPhaseControl?: boolean }).isPhaseControl;
    const currentPhase = (flag.config_json as { value?: string })?.value ?? 'phase_1';

    return (
      <TableRow key={flag.id}>
        <TableCell>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <span className="font-medium block text-sm">{info.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{flag.flag_key}</span>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs max-w-xs">{info.description}</TableCell>
        <TableCell>
          <span className="text-[10px] font-mono text-muted-foreground">{(info as any).safeDefault}</span>
        </TableCell>
        <TableCell>
          {flag.is_enabled
            ? <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">Active</Badge>
            : <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">Off</Badge>
          }
        </TableCell>
        <TableCell className="text-right">
          {isPhaseControl ? (
            <Select
              value={currentPhase}
              onValueChange={v => updatePhaseMutation.mutate({ id: flag.id, phase: v })}
              disabled={updatePhaseMutation.isPending}
            >
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phase_1">Phase 1</SelectItem>
                <SelectItem value="phase_2">Phase 2</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Switch
              checked={flag.is_enabled}
              onCheckedChange={checked => toggleMutation.mutate({ id: flag.id, isEnabled: checked })}
              disabled={toggleMutation.isPending}
            />
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>
            Operational toggles that gate product capabilities. Phase 1 hard-gates all video features regardless of individual flags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading flags…</div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Safe Default</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Control</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedFlags.map(renderRow)}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
          <div className="flex items-start gap-3">
            <Image className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <h4 className="font-medium text-sm">Phase 1 — Active Now</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Copywriting + Pro Photo (AI image generation). Style Intelligence Engine included.
                Export as images for use in any scheduler.
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-lg border border-border/50 bg-muted/20 opacity-70">
          <div className="flex items-start gap-3">
            <Video className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Phase 2 — Video & Reels</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Template Reel (Ken Burns) + Cinematic AI Reel (Kling). Flip <code className="text-xs bg-muted px-1 rounded">product_phase</code> to phase_2 to unlock.
                Requires <code className="text-xs bg-muted px-1 rounded">KLING_API_KEY</code> configured in Integrations & API Keys.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
