import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Pin, BarChart2, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useStyleAssets } from '@/hooks/use-style-assets';
import { StyleChannelUploader } from './StyleChannelUploader';
import { StyleAssetCard } from './StyleAssetCard';
import { StyleProfileSummary } from './StyleProfileSummary';
import { EmptyState } from '@/components/ui/empty-state';
import {
  StyleChannel,
  VenueStyleProfile,
  ChannelProfile,
  CHANNEL_LABELS,
  CHANNEL_DESCRIPTIONS,
} from '@/types/style-intelligence';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const CHANNELS: StyleChannel[] = ['brand', 'atmosphere', 'plating'];

interface StyleIntelligencePanelProps {
  venueId: string;
  canEdit: boolean;
}

function ChannelPanel({
  venueId,
  channel,
  canEdit,
  profile,
}: {
  venueId: string;
  channel: StyleChannel;
  canEdit: boolean;
  profile: ChannelProfile | null;
}) {
  const { assets, loading, refetch } = useStyleAssets(venueId, channel);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">{CHANNEL_LABELS[channel]}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{CHANNEL_DESCRIPTIONS[channel]}</p>
        </div>
        {canEdit && (
          <StyleChannelUploader venueId={venueId} channel={channel} onComplete={refetch} />
        )}
      </div>

      {/* Profile summary strip */}
      {assets.some(a => a.status === 'analyzed') && (
        <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
          <StyleProfileSummary profile={profile} label={CHANNEL_LABELS[channel]} />
        </div>
      )}

      {/* Asset grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={`No ${CHANNEL_LABELS[channel]} references`}
          description="Upload images to teach the AI your visual style for this channel."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map(asset => (
            <StyleAssetCard
              key={asset.id}
              asset={asset}
              canEdit={canEdit}
              onUpdate={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StyleIntelligencePanel({ venueId, canEdit }: StyleIntelligencePanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeChannel, setActiveChannel] = useState<StyleChannel>('brand');
  const [styleProfile, setStyleProfile] = useState<VenueStyleProfile | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('venue_style_profile')
      .select('*')
      .eq('venue_id', venueId)
      .maybeSingle();
    setStyleProfile(data as VenueStyleProfile | null);
  };

  useEffect(() => { fetchProfile(); }, [venueId]);

  const handleRebuild = async () => {
    if (!user) return;
    setRebuilding(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/rebuild-style-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ venue_id: venueId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      await fetchProfile();
      toast({ title: 'Style profile rebuilt' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Rebuild failed', description: e.message });
    } finally {
      setRebuilding(false);
    }
  };

  const getChannelProfile = (ch: StyleChannel): ChannelProfile | null => {
    if (!styleProfile) return null;
    const key = `${ch}_profile` as keyof VenueStyleProfile;
    const p = styleProfile[key] as ChannelProfile | Record<string, never>;
    return p && 'sample_size' in p ? (p as ChannelProfile) : null;
  };

  const totalRefs = Object.keys(styleProfile || {}).length > 0
    ? (getChannelProfile('brand')?.sample_size || 0) +
      (getChannelProfile('atmosphere')?.sample_size || 0) +
      (getChannelProfile('plating')?.sample_size || 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with rebuild */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-accent" />
            <h2 className="font-serif text-xl font-medium">Style Intelligence</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Upload reference images so the AI learns your visual language. Works across image, video, and copy generation.
          </p>
        </div>
        {canEdit && totalRefs > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRebuild}
            disabled={rebuilding}
            className="gap-2 shrink-0"
          >
            {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rebuild Profile
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-muted/40 border border-border rounded-lg p-4 flex items-start gap-3">
        <BarChart2 className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="text-foreground font-medium">How Style Intelligence works</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Upload inspiration images across three channels. Gemini analyses each one for palette, lighting, composition, and mood. 
            Pinned assets get 2× weight. The AI uses weighted scoring to build your venue's style signature — which automatically 
            influences image generation, reel creation, and copywriting.
          </p>
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {CHANNELS.map(ch => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all ${
              activeChannel === ch
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {CHANNEL_LABELS[ch]}
          </button>
        ))}
      </div>

      {/* Active channel content */}
      <motion.div
        key={activeChannel}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="card-elevated p-6"
      >
        <ChannelPanel
          venueId={venueId}
          channel={activeChannel}
          canEdit={canEdit}
          profile={getChannelProfile(activeChannel)}
        />
      </motion.div>

      {/* Pin hint */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Pin className="w-3 h-3" />
        Pin your strongest references to give them 2× influence on the style profile.
      </p>
    </div>
  );
}
