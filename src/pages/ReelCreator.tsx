import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Film,
  Image,
  Play,
  Settings2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useCreateReel, ContentAsset } from '@/hooks/use-content-assets';
import { useGalleryFlags } from '@/hooks/use-gallery-flags';

type JobStatus = 'idle' | 'submitting' | 'queued' | 'completed' | 'failed';

export default function ReelCreator() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const flags = useGalleryFlags();
  const createReel = useCreateReel();

  const sourceAssetId = searchParams.get('source');
  const [sourceAsset, setSourceAsset] = useState<ContentAsset | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [loadingSource, setLoadingSource] = useState(!!sourceAssetId);

  // Reel settings
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [motionPreset, setMotionPreset] = useState('slow_zoom');
  const [duration, setDuration] = useState('5');
  const [reelStyle, setReelStyle] = useState('cinematic');
  const [notes, setNotes] = useState('');
  const [hookText, setHookText] = useState('');

  // Provider status
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);

  // Job tracking
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobResult, setJobResult] = useState<{ asset_id?: string; message?: string } | null>(null);

  useEffect(() => {
    if (!sourceAssetId || !currentVenue) return;
    (async () => {
      setLoadingSource(true);
      try {
        const { data } = await supabase
          .from('content_assets')
          .select('*')
          .eq('id', sourceAssetId)
          .eq('venue_id', currentVenue.id)
          .single();

        if (data) {
          const asset = data as ContentAsset;
          setSourceAsset(asset);
          if (asset.public_url) {
            setSourceUrl(asset.public_url);
          } else if (asset.storage_path) {
            const { data: signed } = await supabase.storage
              .from('venue-assets')
              .createSignedUrl(asset.storage_path, 3600);
            setSourceUrl(signed?.signedUrl || '');
          }
        }
      } finally {
        setLoadingSource(false);
      }
    })();
  }, [sourceAssetId, currentVenue]);

  // Check provider status
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_api_keys')
        .select('key_name')
        .eq('key_name', 'KLING_API_KEY')
        .eq('is_configured', true)
        .limit(1);
      setProviderConfigured((data?.length || 0) > 0);
    })();
  }, []);

  const handleCreateReel = async () => {
    if (!sourceAsset || !currentVenue) return;
    setJobStatus('submitting');
    try {
      const result = await createReel.mutateAsync({
        source_asset_id: sourceAsset.id,
        venue_id: currentVenue.id,
        reel_style: reelStyle,
        aspect_ratio: aspectRatio,
        motion_preset: motionPreset,
        duration_seconds: Number(duration),
      });
      setJobStatus(result?.provider_configured ? 'queued' : 'queued');
      setJobResult({
        asset_id: result?.asset?.id,
        message: result?.message,
      });
    } catch {
      setJobStatus('failed');
    }
  };

  const reelEnabled = flags.video_enabled && flags.reel_creator_enabled;

  // Feature disabled state
  if (!flags.isLoading && !reelEnabled) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <PageHeader title="Reel Creator" description="Transform your images into scroll-stopping video content." />
        </div>
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <Film className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-lg font-serif font-medium mb-2">Video Generation Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Turn your Pro Photos into engaging Reels and Stories. This feature is being prepared and will be available soon.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['One-click video from images', 'Multiple aspect ratios', 'Motion presets', 'AI captions'].map((f) => (
                <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title="Reel Creator"
          description="Transform your images into scroll-stopping video content."
        />
      </div>

      {/* Job status banner */}
      {jobStatus === 'queued' && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-accent">Reel Job Queued</p>
            <p className="text-xs text-muted-foreground mt-1">
              {jobResult?.message || 'Your reel creation job has been queued.'}
            </p>
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto mt-2 text-xs"
              onClick={() => navigate('/content/library')}
            >
              View in Content Gallery →
            </Button>
          </div>
        </div>
      )}

      {jobStatus === 'failed' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Reel Creation Failed</p>
            <p className="text-xs text-muted-foreground mt-1">Something went wrong. Please try again.</p>
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto mt-2 text-xs"
              onClick={() => setJobStatus('idle')}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Source Image */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-serif">
              <Image className="w-4 h-4 text-accent" />
              Source Image
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSource ? (
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sourceAsset && sourceUrl ? (
              <div className="space-y-3">
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <img src={sourceUrl} alt={sourceAsset.title || ''} className="w-full h-full object-cover" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">{sourceAsset.source_type.replace('_', ' ')}</Badge>
                  <span className="text-xs text-muted-foreground">{sourceAsset.title || 'Untitled'}</span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Image}
                title="No source image selected"
                description="Select an image from the Content Gallery to create a reel."
              />
            )}

            {!sourceAssetId && (
              <Button variant="outline" className="w-full mt-4" onClick={() => navigate('/content/library')}>
                Choose from Gallery
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Reel Settings */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-serif">
              <Settings2 className="w-4 h-4 text-accent" />
              Reel Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {providerConfigured === false && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Video provider not configured</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    A video generation provider needs to be configured in Platform Admin before reels can be processed. Jobs will be queued for when the provider is ready.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 (Stories / Reels)</SelectItem>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Motion Preset</Label>
              <Select value={motionPreset} onValueChange={setMotionPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow_zoom">Slow Zoom</SelectItem>
                  <SelectItem value="pan_left">Pan Left</SelectItem>
                  <SelectItem value="pan_right">Pan Right</SelectItem>
                  <SelectItem value="orbit">Orbit</SelectItem>
                  <SelectItem value="parallax">Parallax</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 seconds</SelectItem>
                  <SelectItem value="5">5 seconds</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={reelStyle} onValueChange={setReelStyle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                  <SelectItem value="dynamic">Dynamic</SelectItem>
                  <SelectItem value="elegant">Elegant</SelectItem>
                  <SelectItem value="energetic">Energetic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Hook / Caption (optional)</Label>
              <Textarea
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                placeholder="Opening text or hook for the reel..."
                className="resize-none"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Style Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any specific instructions for the reel..."
                className="resize-none"
                rows={2}
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleCreateReel}
              disabled={!sourceAsset || jobStatus === 'submitting' || jobStatus === 'queued'}
            >
              {jobStatus === 'submitting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : jobStatus === 'queued' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {jobStatus === 'submitting'
                ? 'Creating...'
                : jobStatus === 'queued'
                  ? 'Queued'
                  : providerConfigured === false
                    ? 'Queue Reel Job'
                    : 'Create Reel'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
