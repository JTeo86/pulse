import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Image, Upload as UploadIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/lib/brand-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface Asset {
  id: string;
  storage_path: string;
  bucket: string;
  created_at: string;
  is_primary: boolean;
}

interface UploadItem {
  id: string;
  storage_path: string;
  status: string;
  created_at: string;
  notes: string | null;
}

export default function BrandLibraryPage() {
  const { currentBrand } = useBrand();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentBrand) return;

    const fetchLibrary = async () => {
      try {
        const [assetsResult, uploadsResult] = await Promise.all([
          supabase
            .from('brand_assets')
            .select('*')
            .eq('venue_id', currentBrand.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('uploads')
            .select('*')
            .eq('venue_id', currentBrand.id)
            .order('created_at', { ascending: false }),
        ]);

        if (assetsResult.data) setAssets(assetsResult.data);
        if (uploadsResult.data) setUploads(uploadsResult.data as UploadItem[]);
      } catch (error) {
        console.error('Error fetching library:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLibrary();
  }, [currentBrand]);

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('venue-assets').getPublicUrl(path);
    return data.publicUrl;
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
          title="Brand Library"
          description="All your brand assets and uploads in one place"
          action={
            <Button onClick={() => navigate('/modules/editor')} className="btn-primary-editorial">
              <UploadIcon className="w-4 h-4 mr-2" />
              Upload New
            </Button>
          }
        />

        <Tabs defaultValue="uploads" className="space-y-6">
          <TabsList>
            <TabsTrigger value="uploads" className="gap-2">
              <Image className="w-4 h-4" />
              Uploads ({uploads.length})
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Brand Assets ({assets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="uploads">
            {uploads.length === 0 ? (
              <EmptyState
                icon={Image}
                title="No uploads yet"
                description="Upload photos from your brand to start creating content"
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {uploads.map((upload, index) => (
                  <motion.div
                    key={upload.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                  >
                    <img
                      src={getPublicUrl(upload.storage_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assets">
            {assets.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="No brand assets"
                description="Add backgrounds, crockery, and other visual assets in Brand Identity"
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {assets.map((asset, index) => (
                  <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="aspect-square rounded-lg overflow-hidden border border-border bg-muted relative"
                  >
                    <img
                      src={getPublicUrl(asset.storage_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {asset.is_primary && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-accent/90 text-accent-foreground text-xs rounded">
                        Primary
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
