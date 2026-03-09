import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Flag, Video, Image, Package, ChevronDown, Sparkles, Link2 } from 'lucide-react';
import { useState } from 'react';

interface FeatureFlag {
  id: string;
  venue_id: string | null;
  flag_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
}

// Core operational flags shown in main view
const CORE_FLAGS: Record<string, {
  name: string;
  description: string;
  safeDefault: string;
  icon: typeof Flag;
  isPhaseControl?: boolean;
}> = {
  product_phase: {
    name: 'Product Phase',
    description: 'Controls which features are available platform-wide. Phase 1 = copy + images. Phase 2 = video unlocked.',
    safeDefault: 'phase_1',
    icon: Package,
    isPhaseControl: true,
  },
  'feature.video_enabled': {
    name: 'Video / Reels',
    description: 'Master switch for all video capabilities. Only active when product_phase = phase_2.',
    safeDefault: 'off',
    icon: Video,
  },
  'feature.reel_creator_enabled': {
    name: 'Reel Creator Visible',
    description: 'Shows Reel Creator in Studio nav and "Create Reel" actions in gallery.',
    safeDefault: 'off',
    icon: Video,
  },
  'style_auto_improve_enabled': {
    name: 'Style Auto-Improve',
    description: 'Automatically re-analyse style assets when new uploads are added.',
    safeDefault: 'on',
    icon: Sparkles,
  },
};

// Secondary flags shown in collapsed Advanced section
const ADVANCED_FLAGS: Record<string, {
  name: string;
  description: string;
}> = {
  'feature.gallery_variations_enabled': { name: 'Gallery Variations', description: 'Create Variation action on gallery assets.' },
  'feature.gallery_lineage_enabled': { name: 'Gallery Lineage', description: 'Version History panel on gallery assets.' },
  'feature.referral_network_enabled': { name: 'Referral Network', description: 'Master toggle for Referral Network module.' },
  'feature.referral_network_private_beta': { name: 'Referral Private Beta', description: 'Limits access to invited beta venues.' },
  'feature.referral_network_public_launch': { name: 'Referral Public Launch', description: 'Makes Referral Network available to all.' },
  'feature.referral_network_stripe_enabled': { name: 'Referral Stripe Payouts', description: 'Enables Stripe Connect automated payouts.' },
};

const CORE_FLAG_ORDER = [
  'product_phase',
  'feature.video_enabled',
  'feature.reel_creator_enabled',
  'style_auto_improve_enabled',
];

export default function FeatureFlagsTab() {
  const queryClient = useQueryClient();
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ['gallery-flags'] });
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
      toast.success('Product phase updated');
    },
    onError: (err) => toast.error('Failed: ' + err.message),
  });

  // Split flags into core and advanced
  const coreFlags = CORE_FLAG_ORDER
    .map(key => flags?.find(f => f.flag_key === key))
    .filter(Boolean) as FeatureFlag[];

  const advancedFlags = (flags ?? []).filter(f => 
    f.flag_key in ADVANCED_FLAGS
  );

  const renderCoreRow = (flag: FeatureFlag) => {
    const info = CORE_FLAGS[flag.flag_key];
    if (!info) return null;
    const Icon = info.icon;
    const isPhaseControl = info.isPhaseControl;
    const currentPhase = (flag.config_json as { value?: string })?.value ?? 'phase_1';

    return (
      <div key={flag.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{info.name}</p>
            <p className="text-xs text-muted-foreground">{info.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {flag.is_enabled
            ? <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">Active</Badge>
            : <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">Off</Badge>
          }
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
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>
            Core operational toggles. Phase 1 hard-gates all video features regardless of individual flags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading flags…</div>
          ) : (
            <div>{coreFlags.map(renderCoreRow)}</div>
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
                Copywriting + Pro Photo (Gemini image generation). Style Intelligence Engine. Export-first publishing.
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
                Kling AI video generation from Pro Photos. Flip product_phase to phase_2 and configure Kling in the Video Provider tab.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced / Internal flags */}
      {advancedFlags.length > 0 && (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flag className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-base">Advanced / Internal</CardTitle>
                    <Badge variant="outline" className="text-[10px]">{advancedFlags.length}</Badge>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </div>
                <CardDescription>Gallery, referral, and other secondary flags.</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <Separator className="mb-3" />
                {advancedFlags.map(flag => {
                  const info = ADVANCED_FLAGS[flag.flag_key] || { name: flag.flag_key, description: '' };
                  return (
                    <div key={flag.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{info.name}</p>
                        <p className="text-xs text-muted-foreground">{info.description}</p>
                      </div>
                      <Switch
                        checked={flag.is_enabled}
                        onCheckedChange={checked => toggleMutation.mutate({ id: flag.id, isEnabled: checked })}
                        disabled={toggleMutation.isPending}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
