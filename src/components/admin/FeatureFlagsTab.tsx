import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Flag, Video, Image, Layers, Zap, PenTool, Package } from 'lucide-react';

interface FeatureFlag {
  id: string;
  venue_id: string | null;
  flag_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const FLAG_INFO: Record<string, { name: string; description: string; icon: typeof Flag; isPhaseControl?: boolean }> = {
  product_phase: {
    name: 'Product Phase',
    description: 'Controls which features are available platform-wide. phase_1 = copy+images only. phase_2 = video unlocked.',
    icon: Package,
    isPhaseControl: true,
  },
  'feature.copywriter_enabled': {
    name: 'Copywriter',
    description: 'Enable the AI copywriting module (email campaigns, social captions, blog posts)',
    icon: PenTool,
  },
  'feature.image_editor_enabled': {
    name: 'Image Editor / Pro Photo',
    description: 'Enable the Pro Photo image generation and visual editing tools',
    icon: Image,
  },
  'feature.video_enabled': {
    name: 'Video / Reels (Phase 2)',
    description: 'Enable video reel output mode. Only active when product_phase = phase_2.',
    icon: Video,
  },
  'feature.kling_enabled': {
    name: 'Kling Cinematic AI Reels',
    description: 'Enable Kling-powered AI video generation. Requires video_enabled + phase_2.',
    icon: Zap,
  },
  visual_editor_v2: {
    name: 'V2 Video Engine (Kling)',
    description: 'Enable Kling-powered video generation (image-to-video, motion templates)',
    icon: Video,
  },
  visual_editor_v1: {
    name: 'V1 Image Engine (PhotoRoom)',
    description: 'Enable PhotoRoom-powered image editing (background removal, enhancement)',
    icon: Image,
  },
};

const PHASE_FLAGS_ORDER = [
  'product_phase',
  'feature.copywriter_enabled',
  'feature.image_editor_enabled',
  'feature.video_enabled',
  'feature.kling_enabled',
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
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: isEnabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
      queryClient.invalidateQueries({ queryKey: ['phase-flags'] });
      toast.success('Feature flag updated');
    },
    onError: (error) => {
      toast.error('Failed to update flag: ' + error.message);
    },
  });

  const updatePhaseValueMutation = useMutation({
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
    onError: (error) => {
      toast.error('Failed to update phase: ' + error.message);
    },
  });

  // Sort flags: phase flags first in defined order, then others
  const phaseFlags = PHASE_FLAGS_ORDER
    .map(key => flags?.find(f => f.flag_key === key))
    .filter(Boolean) as FeatureFlag[];
  const otherFlags = (flags ?? []).filter(f => !PHASE_FLAGS_ORDER.includes(f.flag_key));

  const renderFlagRow = (flag: FeatureFlag) => {
    const info = FLAG_INFO[flag.flag_key] || {
      name: flag.flag_key,
      description: (flag.config_json as { description?: string })?.description || 'No description',
      icon: Flag,
    };
    const IconComponent = info.icon;
    const isPhaseControl = (info as { isPhaseControl?: boolean }).isPhaseControl;
    const currentPhase = (flag.config_json as { value?: string })?.value ?? 'phase_1';

    return (
      <TableRow key={flag.id}>
        <TableCell>
          <div className="flex items-center gap-2">
            <IconComponent className="w-4 h-4 text-muted-foreground" />
            <div>
              <span className="font-medium block">{info.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{flag.flag_key}</span>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm max-w-xs">
          {info.description}
        </TableCell>
        <TableCell>
          {flag.is_enabled ? (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Disabled
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          {isPhaseControl ? (
            <Select
              value={currentPhase}
              onValueChange={(v) => updatePhaseValueMutation.mutate({ id: flag.id, phase: v })}
              disabled={updatePhaseValueMutation.isPending}
            >
              <SelectTrigger className="w-32 h-8 text-xs">
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
              onCheckedChange={(checked) => toggleMutation.mutate({ id: flag.id, isEnabled: checked })}
              disabled={toggleMutation.isPending}
            />
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      {/* Phase Control */}
      <Card>
        <CardHeader>
          <CardTitle>Product Phase & Feature Flags</CardTitle>
          <CardDescription>
            Set the current product phase and enable/disable features. Phase 1 hard-gates all video features regardless of individual flags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading flags...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Control</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phaseFlags.map(renderFlagRow)}
                {otherFlags.length > 0 && otherFlags.map(renderFlagRow)}
              </TableBody>
            </Table>
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
                Template Reel (Ken Burns) + Cinematic AI Reel (Kling). Flip product_phase to phase_2 to unlock.
                Requires KLING_API_KEY configured in Integrations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
