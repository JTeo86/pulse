import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Image, Trash2, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
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
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = isAdmin && !isDemoMode;

  const fetchUploads = async () => {
    if (!currentBrand) return;
    try {
      const { data } = await supabase
        .from('uploads')
        .select('*')
        .eq('venue_id', currentBrand.id)
        .order('created_at', { ascending: false });
      if (data) setUploads(data as UploadItem[]);
    } catch (error) {
      console.error('Error fetching uploads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentBrand) return;
    fetchUploads();
  }, [currentBrand]);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Load signed URLs for all uploads (bucket is private)
  useEffect(() => {
    const loadSignedUrls = async () => {
      const urls: Record<string, string> = {};
      for (const upload of uploads) {
        const { data } = await supabase.storage
          .from('venue-assets')
          .createSignedUrl(upload.storage_path, 3600); // 1 hour TTL
        if (data?.signedUrl) {
          urls[upload.id] = data.signedUrl;
        }
      }
      setImageUrls(urls);
    };
    if (uploads.length > 0) loadSignedUrls();
  }, [uploads]);

  const handleDeleteUpload = async (upload: UploadItem) => {
    setDeletingId(upload.id);
    try {
      const { error: storageError } = await supabase.storage.from('venue-assets').remove([upload.storage_path]);
      if (storageError) console.error('Storage delete error:', storageError);

      const { error: dbError } = await supabase.from('uploads').delete().eq('id', upload.id);
      if (dbError) throw dbError;

      toast({ title: 'Photo deleted', description: 'The photo has been removed from your library.' });
      setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Delete failed', description: 'Could not delete photo.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Content Library"
          description="Store and access your uploaded and generated brand content."
        />

        <Tabs defaultValue="uploads" className="space-y-6">
          <TabsList>
            <TabsTrigger value="uploads" className="gap-2">
              <Image className="w-4 h-4" />
              Uploads ({uploads.length})
            </TabsTrigger>
          </TabsList>

          {/* Uploads Tab */}
          <TabsContent value="uploads" className="space-y-4">
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
                title="No photos yet"
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
                      src={imageUrls[upload.id] || ''}
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
                                This will permanently delete this photo from your library. Any content using this photo may be affected.
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
        </Tabs>
      </motion.div>
  );
}
