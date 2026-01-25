import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Image, FileText, Info, Trash2, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { BrandKitUploader } from '@/components/brand/BrandKitUploader';
import { BrandKitFileList } from '@/components/brand/BrandKitFileList';
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

interface UploadItem {
  id: string;
  storage_path: string;
  status: string;
  created_at: string;
  notes: string | null;
}

interface BrandKitFile {
  id: string;
  file_name: string;
  file_type: string;
  category: string | null;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
}

export default function BrandLibraryPage() {
  const { currentVenue: currentBrand, isAdmin, isDemoMode } = useVenue();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [brandKitFiles, setBrandKitFiles] = useState<BrandKitFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = isAdmin && !isDemoMode;

  const fetchLibrary = async () => {
    if (!currentBrand) return;

    try {
      const [uploadsResult, brandKitResult] = await Promise.all([
        supabase
          .from('uploads')
          .select('*')
          .eq('venue_id', currentBrand.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('brand_kit_files')
          .select('*')
          .eq('venue_id', currentBrand.id)
          .order('created_at', { ascending: false }),
      ]);

      if (uploadsResult.data) setUploads(uploadsResult.data as UploadItem[]);
      if (brandKitResult.data) setBrandKitFiles(brandKitResult.data as BrandKitFile[]);
    } catch (error) {
      console.error('Error fetching library:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentBrand) return;
    fetchLibrary();
  }, [currentBrand]);

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('venue-assets').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleDeleteUpload = async (upload: UploadItem) => {
    setDeletingId(upload.id);

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('venue-assets')
        .remove([upload.storage_path]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
      }

      // Delete DB record
      const { error: dbError } = await supabase
        .from('uploads')
        .delete()
        .eq('id', upload.id);

      if (dbError) {
        throw dbError;
      }

      toast({
        title: 'Photo deleted',
        description: 'The photo has been removed from your gallery.',
      });

      setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete photo. You may not have permission.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <PageHeader
          title="Brand Library & Brief"
          description="Your brand materials, assets, and AI briefing in one place"
        />

        <Tabs defaultValue="brief" className="space-y-6">
          <TabsList>
            <TabsTrigger value="brief" className="gap-2">
              <FileText className="w-4 h-4" />
              Brand Brief
            </TabsTrigger>
            <TabsTrigger value="gallery" className="gap-2">
              <Image className="w-4 h-4" />
              Gallery ({uploads.length})
            </TabsTrigger>
            <TabsTrigger value="brand-kit" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Brand Kit ({brandKitFiles.length})
            </TabsTrigger>
          </TabsList>

          {/* Brand Brief Tab */}
          <TabsContent value="brief" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="font-serif text-xl font-medium">Brand Brief (for AI)</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This information guides how the AI thinks, writes, and represents your brand.
                </p>
              </div>

              <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-foreground">
                    Think of this as the briefing document you would give a copywriter or marketer.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The AI uses this to decide <em>what to say</em>, not how things look.
                  </p>
                </div>
              </div>

              <div className="card-elevated p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">What to include in your brief:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Brand positioning and unique value proposition</li>
                    <li>Target audience and customer personas</li>
                    <li>Tone of voice (e.g., casual, professional, playful)</li>
                    <li>Key messaging and taglines</li>
                    <li>Website copy, menu descriptions, or brand notes</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground italic">
                  The more context you provide, the better the AI can write in your voice.
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                If this section is left empty, the AI will use generic hospitality assumptions.
              </p>
            </div>
          </TabsContent>

          {/* Gallery Tab - Content photos from Editor */}
          <TabsContent value="gallery" className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Photos uploaded via the Editor for content creation. Manage and delete them here.
              </p>
              <Button
                onClick={() => navigate('/studio/editor')}
                className="btn-primary-editorial flex-shrink-0"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Open Editor
              </Button>
            </div>

            {uploads.length === 0 ? (
              <EmptyState
                icon={Image}
                title="No photos in gallery"
                description="Photos will appear here once you upload them in the Editor"
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
                      src={getPublicUrl(upload.storage_path)}
                      alt={upload.notes || ''}
                      className="w-full h-full object-cover"
                    />
                    {canEdit && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              disabled={deletingId === upload.id}
                            >
                              {deletingId === upload.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete photo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this photo from your gallery. Any content using this photo may be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUpload(upload)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
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

          {/* Brand Kit Tab - Brand identity files */}
          <TabsContent value="brand-kit" className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Upload brand guidelines, logos, fonts, and tone-of-voice docs. These keep your content consistent.
            </p>

            {canEdit && currentBrand && (
              <BrandKitUploader
                venueId={currentBrand.id}
                onUploadComplete={fetchLibrary}
              />
            )}

            {isDemoMode && (
              <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm text-muted-foreground">
                You're viewing demo data. Sign in and select your brand to upload files.
              </div>
            )}

            {brandKitFiles.length === 0 && !canEdit ? (
              <EmptyState
                icon={FolderOpen}
                title="No brand kit files"
                description="Brand guidelines, logos, and fonts will appear here"
              />
            ) : (
              <BrandKitFileList
                files={brandKitFiles}
                canEdit={canEdit}
                onDeleteComplete={fetchLibrary}
              />
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
