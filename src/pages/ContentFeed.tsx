import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { resolveAssetMediaUrl } from '@/hooks/use-resolved-media';
import { useAutopilotTrigger } from '@/hooks/use-autopilot';

type FeedAsset = {
  id: string;
  title: string | null;
  public_url: string | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
  resolved_url?: string;
};

type AssetUsage = {
  count: number;
  lastUsedAt: string | null;
};

export default function ContentFeed() {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [lastUploadCount, setLastUploadCount] = useState<number | null>(null);
  const autopilotTrigger = useAutopilotTrigger();

  const { data, isLoading } = useQuery({
    queryKey: ['content-feed-assets', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      if (!currentVenue) return { assets: [], usageMap: new Map<string, AssetUsage>() };

      const [assetsRes, usageRes] = await Promise.all([
        supabase
          .from('content_assets')
          .select('id, title, public_url, thumbnail_url, storage_path, storage_bucket, created_at, metadata, source_type')
          .eq('venue_id', currentVenue.id)
          .eq('asset_type', 'image')
          .in('source_type', ['upload', 'manual', 'guest_upload'])
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('content_items')
          .select('created_at, media_variants')
          .eq('venue_id', currentVenue.id)
          .eq('source', 'autopilot')
          .order('created_at', { ascending: false })
          .limit(600),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (usageRes.error) throw usageRes.error;

      const usageMap = new Map<string, AssetUsage>();
      for (const item of usageRes.data || []) {
        const variants = item.media_variants as Record<string, any> | null;
        const sourceAssetId = variants?.source_asset_id;
        if (!sourceAssetId) continue;

        const existing = usageMap.get(sourceAssetId);
        const nextCount = (existing?.count || 0) + 1;
        const lastUsedAt = !existing?.lastUsedAt || new Date(item.created_at) > new Date(existing.lastUsedAt)
          ? item.created_at
          : existing.lastUsedAt;
        usageMap.set(sourceAssetId, { count: nextCount, lastUsedAt });
      }

      const resolvedAssets = await Promise.all(((assetsRes.data || []) as FeedAsset[]).map(async (asset) => ({
        ...asset,
        resolved_url: await resolveAssetMediaUrl({
          public_url: asset.public_url,
          thumbnail_url: asset.thumbnail_url,
          storage_path: asset.storage_path,
          storage_bucket: asset.storage_bucket,
        }),
      })));

      return { assets: resolvedAssets, usageMap };
    },
  });

  const { data: onboardingDrafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ['content-feed-onboarding-drafts', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data: draftRows, error } = await supabase
        .from('content_items')
        .select('id, title, caption_draft, thumbnail_url, media_master_url, created_at, status')
        .eq('venue_id', currentVenue.id)
        .eq('source', 'autopilot')
        .in('status', ['draft', 'pending_review'])
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return draftRows || [];
    },
  });

  const { data: approvedOnboardingCount = 0 } = useQuery({
    queryKey: ['content-feed-approved-onboarding', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      if (!currentVenue) return 0;
      const { count, error } = await supabase
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', currentVenue.id)
        .eq('source', 'autopilot')
        .eq('status', 'approved');
      if (error) throw error;
      return count || 0;
    },
  });

  const assets = data?.assets || [];
  const usageMap = data?.usageMap || new Map<string, AssetUsage>();

  const handleAddPhotosClick = () => {
    fileInputRef.current?.click();
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !currentVenue || !user) return;

    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      toast({ title: 'No images selected', description: 'Please choose one or more image files.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `${crypto.randomUUID()}.${ext}`;
        const storagePath = `venues/${currentVenue.id}/uploads/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('asset-pool').upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { error: insertAssetError } = await supabase.from('content_assets').insert({
          venue_id: currentVenue.id,
          asset_type: 'image',
          source_type: 'upload',
          status: 'approved',
          title: file.name,
          storage_path: storagePath,
          storage_bucket: 'asset-pool',
          pool: 'asset_pool',
          public_url: null,
          metadata: {
            autopilot_reusable: true,
            content_feed: true,
            upload_source: 'content_feed',
            usage_count: 0,
          },
        });
        if (insertAssetError) throw insertAssetError;

        const { error: insertUploadError } = await supabase.from('uploads').insert({
          venue_id: currentVenue.id,
          uploaded_by: user.id,
          storage_path: storagePath,
          status: 'new',
          notes: 'Uploaded from Content Feed',
        });
        if (insertUploadError) throw insertUploadError;
      }

      await queryClient.invalidateQueries({ queryKey: ['content-feed-assets', currentVenue.id] });
      await autopilotTrigger.mutateAsync('daily_content');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-feed-onboarding-drafts', currentVenue.id] }),
        queryClient.invalidateQueries({ queryKey: ['content-feed-approved-onboarding', currentVenue.id] }),
      ]);
      setLastUploadCount(files.length);
      toast({ title: 'Photos added', description: `${files.length} photo${files.length > 1 ? 's' : ''} added. Pulse is preparing posts now.` });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const summary = useMemo(() => {
    const unusedCount = assets.filter((asset) => !usageMap.get(asset.id)?.count).length;
    const lastUploadDate = assets[0]?.created_at || null;
    return { unusedCount, lastUploadDate };
  }, [assets, usageMap]);

  const approvePost = async (id: string) => {
    const { error } = await supabase.from('content_items').update({ status: 'approved' }).eq('id', id);
    if (error) {
      toast({ title: 'Could not approve post', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Post approved', description: 'Great — I’ll keep preparing more automatically.' });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['content-feed-onboarding-drafts', currentVenue?.id] }),
      queryClient.invalidateQueries({ queryKey: ['content-feed-approved-onboarding', currentVenue?.id] }),
      queryClient.invalidateQueries({ queryKey: ['home-command-centre-overview', currentVenue?.id] }),
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={assets.length === 0 ? "Let's get your content flowing" : 'Photos'}
        description={assets.length === 0 ? 'Start with photos. I’ll prepare posts right away.' : 'Upload everyday photos. Pulse uses these to create content automatically.'}
        action={
          <Button onClick={handleAddPhotosClick} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
            Add Photos
          </Button>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleUploadFiles(e.target.files)}
      />

      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{summary.unusedCount} unused photos ready for Autopilot</p>
            <p className="text-xs text-muted-foreground">
              {summary.lastUploadDate ? `Last upload ${formatDistanceToNow(new Date(summary.lastUploadDate), { addSuffix: true })}` : 'No uploads yet'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/content/library">Open Ready</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/autopilot">Automation status</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastUploadCount !== null && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Photos added</p>
              <p className="text-sm text-muted-foreground">
                Pulse is preparing posts from your latest upload of {lastUploadCount} photo{lastUploadCount === 1 ? '' : 's'}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/content/library">View Ready</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/content/calendar">View Calendar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <p className="text-lg font-medium">Let’s get your content flowing</p>
            <Button onClick={handleAddPhotosClick} disabled={isUploading}>Add Photos</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Pulse is preparing posts from your photos.</p>
              {draftsLoading || autopilotTrigger.isPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing content...
                </div>
              ) : onboardingDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">I’m still preparing your first posts. Open Ready in a moment.</p>
              ) : (
                <div className="space-y-3">
                  {onboardingDrafts.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{item.title || 'New post ready'}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.caption_draft || 'Caption ready to review.'}</p>
                      </div>
                      <Button size="sm" onClick={() => approvePost(item.id)}>Approve to Ready</Button>
                    </div>
                  ))}
                </div>
              )}
              {approvedOnboardingCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Nice — Autopilot will keep preparing posts automatically.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/content/library">View Ready</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/content/calendar">Open Calendar</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => {
              const usage = usageMap.get(asset.id) || { count: 0, lastUsedAt: null };
              const badge = getUsageBadge(usage);

              return (
                <Card key={asset.id} className="overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => navigate('/assets')}
                  >
                    <div className="aspect-square bg-muted">
                      {(asset.resolved_url || asset.public_url) ? (
                        <img src={asset.resolved_url || asset.public_url || ''} alt={asset.title || 'Content feed item'} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No preview</div>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <span className="text-xs text-muted-foreground">{usage.count} uses</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{asset.title || 'Uploaded image'}</p>
                      <p className="text-xs text-accent inline-flex items-center gap-1"><Sparkles className="w-3 h-3" />Review in Assets</p>
                    </div>
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getUsageBadge(usage: AssetUsage): { label: 'unused' | 'used recently' | 'overused'; variant: 'secondary' | 'outline' | 'destructive' } {
  if (usage.count === 0) return { label: 'unused', variant: 'secondary' };

  const lastUsedDays = usage.lastUsedAt
    ? (Date.now() - new Date(usage.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (usage.count >= 3 && lastUsedDays <= 30) {
    return { label: 'overused', variant: 'destructive' };
  }

  return { label: 'used recently', variant: 'outline' };
}
