import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Sparkles, Image, Palette, Camera, CheckCircle2, Pin,
  RefreshCw, Loader2, Clock, ArrowRight,
} from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StyleChannelUploader } from '@/components/style/StyleChannelUploader';
import { StyleAssetCard } from '@/components/style/StyleAssetCard';
import { StyleProfileSummary } from '@/components/style/StyleProfileSummary';
import { EmptyState } from '@/components/ui/empty-state';
import { useStyleAssets } from '@/hooks/use-style-assets';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  StyleChannel,
  VenueStyleProfile,
  ChannelProfile,
  CHANNEL_LABELS,
} from '@/types/style-intelligence';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Tab config ──────────────────────────────────────────────
const TABS = [
  {
    value: 'brand' as const,
    label: 'Brand Inspiration',
    icon: Palette,
    description: 'Campaign references, editorial shots, logos in context, and aesthetic direction that defines your brand look.',
  },
  {
    value: 'atmosphere' as const,
    label: 'Venue Atmosphere',
    icon: Image,
    description: 'Interior shots, lighting mood, bar feel, crowd ambiance — everything that captures your venue\'s environment.',
  },
  {
    value: 'plating' as const,
    label: 'Plating & Presentation',
    icon: Camera,
    description: 'Dish close-ups, crockery, garnish style, and food composition that define your presentation standards.',
  },
  {
    value: 'approved' as const,
    label: 'Approved References',
    icon: CheckCircle2,
    description: 'AI-generated outputs you\'ve promoted into the style system. These reinforce what works for your venue.',
  },
] as const;

type TabValue = typeof TABS[number]['value'];

// ── Main page ───────────────────────────────────────────────
export default function VisualStyle() {
  const { currentVenue, isAdmin } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabValue>('brand');
  const [styleProfile, setStyleProfile] = useState<VenueStyleProfile | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch venue style profile
  const fetchProfile = useCallback(async () => {
    if (!currentVenue) return;
    const { data } = await supabase
      .from('venue_style_profile')
      .select('*')
      .eq('venue_id', currentVenue.id)
      .maybeSingle();
    setStyleProfile(data as VenueStyleProfile | null);
  }, [currentVenue?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const getChannelProfile = (ch: StyleChannel): ChannelProfile | null => {
    if (!styleProfile) return null;
    const key = `${ch}_profile` as keyof VenueStyleProfile;
    const p = styleProfile[key] as ChannelProfile | Record<string, never>;
    return p && 'sample_size' in p ? (p as ChannelProfile) : null;
  };

  const totalRefs =
    (getChannelProfile('brand')?.sample_size || 0) +
    (getChannelProfile('atmosphere')?.sample_size || 0) +
    (getChannelProfile('plating')?.sample_size || 0);

  const pinnedCount = totalRefs; // approximate; actual pinned would need a query
  const lastRebuilt = styleProfile?.updated_at
    ? new Date(styleProfile.updated_at).toLocaleDateString()
    : null;

  const handleRebuild = async () => {
    if (!user || !currentVenue) return;
    setRebuilding(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/rebuild-style-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ venue_id: currentVenue.id }),
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

  const handleUploadComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!currentVenue) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Select a venue to manage visual style.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ── Page header ── */}
      <PageHeader
        title="Visual Style"
        description="Train Pulse on your venue's visual language using brand inspiration, atmosphere references, plating references, and approved outputs."
        action={
          isAdmin && totalRefs > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRebuild}
              disabled={rebuilding}
              className="gap-2"
            >
              {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Rebuild Profile
            </Button>
          ) : undefined
        }
      />

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total References" value={totalRefs} />
        <SummaryCard label="Channels Active" value={
          [getChannelProfile('brand'), getChannelProfile('atmosphere'), getChannelProfile('plating')]
            .filter(p => p && p.sample_size > 0).length
        } suffix="/ 3" />
        <SummaryCard label="Last Rebuilt" value={lastRebuilt || '—'} isText />
        <SummaryCard
          label="Profile Status"
          value={totalRefs > 0 ? 'Active' : 'No data'}
          isText
          accent={totalRefs > 0}
        />
      </div>

      {/* ── Brand Basics context card ── */}
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Sparkles className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Visual references work best when{' '}
                <Link to="/venue/brand-basics" className="text-accent hover:underline">Brand Basics</Link>
                {' '}is complete — cuisine, tone, and brand summary help the AI contextualise your style.
              </p>
            </div>
            <Link to="/venue/brand-basics">
              <Button variant="ghost" size="sm" className="gap-1 shrink-0 text-accent">
                Brand Basics <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── Single tab system ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="grid w-full grid-cols-4">
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Reference channel tabs */}
        {TABS.filter(t => t.value !== 'approved').map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="mt-6">
            <ChannelSection
              venueId={currentVenue.id}
              channel={tab.value as StyleChannel}
              title={tab.label}
              description={tab.description}
              canEdit={isAdmin}
              profile={getChannelProfile(tab.value as StyleChannel)}
              onUploadComplete={handleUploadComplete}
            />
          </TabsContent>
        ))}

        {/* Approved References tab */}
        <TabsContent value="approved" className="mt-6">
          <ApprovedReferencesSection
            venueId={currentVenue.id}
            canEdit={isAdmin}
          />
        </TabsContent>
      </Tabs>

      {/* ── Pin hint ── */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Pin className="w-3 h-3" />
        Pin your strongest references to give them 2× influence on the style profile.
      </p>
    </motion.div>
  );
}

// ── Summary card ────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  suffix,
  isText,
  accent,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  isText?: boolean;
  accent?: boolean;
}) {
  return (
    <Card className="bg-card">
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        <p className={`text-lg font-semibold ${accent ? 'text-accent' : 'text-foreground'} ${isText ? 'text-sm' : ''}`}>
          {value}{suffix && <span className="text-muted-foreground text-sm ml-0.5">{suffix}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Channel section (Brand / Atmosphere / Plating) ──────────
function ChannelSection({
  venueId,
  channel,
  title,
  description,
  canEdit,
  profile,
  onUploadComplete,
}: {
  venueId: string;
  channel: StyleChannel;
  title: string;
  description: string;
  canEdit: boolean;
  profile: ChannelProfile | null;
  onUploadComplete: () => void;
}) {
  const { assets, loading, refetch } = useStyleAssets(venueId, channel);

  const handleComplete = () => {
    refetch();
    onUploadComplete();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {canEdit && (
            <StyleChannelUploader venueId={venueId} channel={channel} onComplete={handleComplete} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline profile summary */}
        {profile && profile.sample_size > 0 && (
          <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
            <StyleProfileSummary profile={profile} label={title} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={Image}
            title="No references yet"
            description={`Upload ${title.toLowerCase()} images to train the AI.`}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {assets.map((asset) => (
              <StyleAssetCard
                key={asset.id}
                asset={asset}
                canEdit={canEdit}
                onUpdate={refetch}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Approved References section ─────────────────────────────
const FILTER_OPTIONS = ['all', 'brand', 'atmosphere', 'plating'] as const;
type FilterValue = typeof FILTER_OPTIONS[number];

const FILTER_LABELS: Record<FilterValue, string> = {
  all: 'All',
  brand: 'Brand',
  atmosphere: 'Atmosphere',
  plating: 'Plating',
};

function ApprovedReferencesSection({
  venueId,
  canEdit,
}: {
  venueId: string;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<FilterValue>('all');

  // Load all approved/style-reference assets from content_assets
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApproved = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_assets')
        .select('*')
        .eq('venue_id', venueId)
        .eq('is_style_reference', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (err) {
      console.error('Error loading approved references:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { fetchApproved(); }, [fetchApproved]);

  const filteredAssets = filter === 'all'
    ? assets
    : assets.filter(a => {
        const meta = a.metadata as Record<string, any> || {};
        return meta.style_channel === filter;
      });

  const handleRemoveFromStyle = async (assetId: string) => {
    try {
      await supabase
        .from('content_assets')
        .update({ is_style_reference: false })
        .eq('id', assetId);
      fetchApproved();
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Approved References</CardTitle>
        <CardDescription>
          AI-generated outputs promoted into the style system. These reinforce what the AI learns works for your venue — 
          distinct from the Content Library which stores all generated assets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                filter === f
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-muted/50 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No approved references yet"
            description="When you approve AI-generated outputs as style references, they'll appear here and influence future generation."
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="group relative rounded-xl overflow-hidden border border-border bg-card hover:border-accent/40 transition-all">
                <div className="relative aspect-square">
                  <img
                    src={asset.public_url || asset.thumbnail_url || '/placeholder.svg'}
                    alt="Approved reference"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Category badge */}
                  {(asset.metadata as any)?.style_channel && (
                    <Badge variant="secondary" className="absolute top-2 left-2 text-[10px]">
                      {(asset.metadata as any).style_channel}
                    </Badge>
                  )}
                  {/* Actions on hover */}
                  {canEdit && (
                    <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveFromStyle(asset.id)}
                        className="text-xs"
                      >
                        Remove from style
                      </Button>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-muted-foreground">
                    {new Date(asset.created_at).toLocaleDateString()}
                  </p>
                  {asset.title && (
                    <p className="text-xs font-medium truncate mt-0.5">{asset.title}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
