import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Image,
  Film,
  Upload,
  Sparkles,
  Trash2,
  Loader2,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AssetCard } from '@/components/gallery/AssetCard';
import { VersionHistoryPanel } from '@/components/gallery/VersionHistoryPanel';
import {
  ContentAsset,
  useContentAssets,
  useCreateVariation,
  useCreateReel,
  useToggleFavorite,
  useDeleteAsset,
  useUpdateAssetStatus,
} from '@/hooks/use-content-assets';
import { useGalleryFlags } from '@/hooks/use-gallery-flags';

interface UploadItem {
  id: string;
  storage_path: string;
  status: string;
  created_at: string;
  notes: string | null;
}

export default function BrandLibraryPage() {
  const { currentVenue: currentBrand, isAdmin, isDemoMode } = useVenue();
  const navigate = useNavigate();
  const { toast } = useToast();
  const canEdit = isAdmin && !isDemoMode;

  // Feature flags
  const flags = useGalleryFlags();

  // Content assets
  const { data: imageAssets = [], isLoading: imagesLoading } = useContentAssets('image');
  const { data: videoAssets = [], isLoading: videosLoading } = useContentAssets('video');

  // Mutations
  const createVariation = useCreateVariation();
  const createReel = useCreateReel();
  const toggleFavorite = useToggleFavorite();
  const deleteAsset = useDeleteAsset();
  const updateStatus = useUpdateAssetStatus();

  // Variation tracking
  const [variatingId, setVariatingId] = useState<string | null>(null);
  const [reelingId, setReelingId] = useState<string | null>(null);

  // Version history panel
  const [lineageAsset, setLineageAsset] = useState<ContentAsset | null>(null);

  // Raw uploads (legacy)
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [uploadUrls, setUploadUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!currentBrand) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('uploads')
          .select('*')
          .eq('venue_id', currentBrand.id)
          .order('created_at', { ascending: false });
        if (data) setUploads(data as UploadItem[]);
      } finally {
        setUploadsLoading(false);
      }
    })();
  }, [currentBrand]);

  useEffect(() => {
    const loadUrls = async () => {
      const urls: Record<string, string> = {};
      for (const u of uploads) {
        const { data } = await supabase.storage
          .from('venue-assets')
          .createSignedUrl(u.storage_path, 3600);
        if (data?.signedUrl) urls[u.id] = data.signedUrl;
      }
      setUploadUrls(urls);
    };
    if (uploads.length > 0) loadUrls();
  }, [uploads]);

  const handleDeleteUpload = async (upload: UploadItem) => {
    setDeletingUploadId(upload.id);
    try {
      await supabase.storage.from('venue-assets').remove([upload.storage_path]);
      await supabase.from('uploads').delete().eq('id', upload.id);
      toast({ title: 'Photo deleted' });
      setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setDeletingUploadId(null);
    }
  };

  const handleCreateVariation = async (asset: ContentAsset) => {
    if (!currentBrand) return;
    setVariatingId(asset.id);
    try {
      await createVariation.mutateAsync({
        parent_asset_id: asset.id,
        venue_id: currentBrand.id,
      });
    } finally {
      setVariatingId(null);
    }
  };

  const handleCreateReel = (asset: ContentAsset) => {
    navigate(`/studio/reel-creator?source=${asset.id}`);
  };

  const handleToggleFavorite = (asset: ContentAsset) => {
    toggleFavorite.mutate({ assetId: asset.id, isFavorite: !asset.is_favorite });
  };

  const handleDelete = (asset: ContentAsset) => {
    deleteAsset.mutate(asset);
  };

  const handleUpdateStatus = (asset: ContentAsset, status: string) => {
    updateStatus.mutate({ assetId: asset.id, status });
  };

  const isLoading = imagesLoading || videosLoading || uploadsLoading || flags.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="Content Gallery"
        description="Your asset command center — manage generated content, create variations, and produce reels."
      />

      <Tabs defaultValue="images" className="space-y-6">
        <TabsList>
          <TabsTrigger value="images" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Generated Images ({imageAssets.length})
          </TabsTrigger>
          {reelEnabled && (
            <TabsTrigger value="reels" className="gap-2">
              <Film className="w-4 h-4" />
              Reels ({videoAssets.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="uploads" className="gap-2">
            <Upload className="w-4 h-4" />
            Raw Uploads ({uploads.length})
          </TabsTrigger>
        </TabsList>

        {/* Generated Images Tab */}
        <TabsContent value="images" className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              AI-generated images and variations. Each asset can be turned into a reel or derived into new versions.
            </p>
            <Button onClick={() => navigate('/studio/pro-photo')} className="btn-primary-editorial flex-shrink-0">
              <Pencil className="w-4 h-4 mr-2" />
              Generate New
            </Button>
          </div>

          {imageAssets.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No generated images yet"
              description="Create your first Pro Photo in the Studio to see it here."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {imageAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onCreateVariation={handleCreateVariation}
                  onCreateReel={handleCreateReel}
                  onViewLineage={setLineageAsset}
                  onToggleFavorite={handleToggleFavorite}
                  onDelete={handleDelete}
                  onUpdateStatus={handleUpdateStatus}
                  showVariation={flags.gallery_variations_enabled}
                  showReel={reelEnabled}
                  showLineage={flags.gallery_lineage_enabled}
                  isCreatingVariation={variatingId === asset.id}
                  isCreatingReel={reelingId === asset.id}
                  canEdit={canEdit}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Reels Tab */}
        {(flags.video_enabled || flags.gallery_reel_enabled) && (
          <TabsContent value="reels" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Video reels generated from your images.
            </p>

            {videoAssets.length === 0 ? (
              <EmptyState
                icon={Film}
                title="No reels yet"
                description="Create a reel from any generated image to see it here."
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {videoAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onViewLineage={setLineageAsset}
                    onToggleFavorite={handleToggleFavorite}
                    onDelete={handleDelete}
                    onUpdateStatus={handleUpdateStatus}
                    showVariation={false}
                    showReel={false}
                    showLineage={flags.gallery_lineage_enabled}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Raw Uploads Tab */}
        <TabsContent value="uploads" className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Photos uploaded via the Editor for content creation. Manage and delete them here.
            </p>
            <Button onClick={() => navigate('/studio/pro-photo')} className="btn-primary-editorial flex-shrink-0">
              <Pencil className="w-4 h-4 mr-2" />
              Open Editor
            </Button>
          </div>

          {uploads.length === 0 ? (
            <EmptyState
              icon={Image}
              title="No photos yet"
              description="Photos will appear here once you upload them in the Editor."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {uploads.map((upload, index) => (
                <motion.div
                  key={upload.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: index * 0.02 }}
                  className="aspect-square rounded-lg overflow-hidden border border-border bg-muted relative group"
                >
                  <img
                    src={uploadUrls[upload.id] || ''}
                    alt={upload.notes || ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {canEdit && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" className="h-8 w-8" disabled={deletingUploadId === upload.id}>
                            {deletingUploadId === upload.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete photo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this photo from your library.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteUpload(upload)} className="bg-destructive hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                  {upload.notes && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-xs text-white truncate">{upload.notes}</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Version History Panel */}
      <VersionHistoryPanel
        asset={lineageAsset}
        open={!!lineageAsset}
        onClose={() => setLineageAsset(null)}
        onCreateVariation={handleCreateVariation}
        onCreateReel={handleCreateReel}
        onToggleFavorite={handleToggleFavorite}
      />
    </motion.div>
  );
}
