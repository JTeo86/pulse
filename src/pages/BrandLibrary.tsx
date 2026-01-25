import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Image, Upload as UploadIcon, FileText, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
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
  const { currentVenue: currentBrand } = useVenue();
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
          title="Brand Library & Brief"
          description="Your brand materials, assets, and AI briefing in one place"
          action={
            <Button onClick={() => navigate('/modules/editor')} className="btn-primary-editorial">
              <UploadIcon className="w-4 h-4 mr-2" />
              Upload New
            </Button>
          }
        />

        <Tabs defaultValue="brief" className="space-y-6">
          <TabsList>
            <TabsTrigger value="brief" className="gap-2">
              <FileText className="w-4 h-4" />
              Brand Brief
            </TabsTrigger>
          <TabsTrigger value="uploads" className="gap-2">
            <Image className="w-4 h-4" />
            Gallery ({uploads.length})
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-2">
            <FolderOpen className="w-4 h-4" />
            Brand Kit ({assets.length})
          </TabsTrigger>
          </TabsList>

          <TabsContent value="brief" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="font-serif text-xl font-medium">Brand Brief (for AI)</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This information guides how the AI thinks, writes, and represents your brand.
                </p>
              </div>

              {/* Informational Callout */}
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

              {/* Placeholder for future brief content */}
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

          <TabsContent value="uploads" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Photos created or uploaded via the Editor. Used for content generation.
            </p>
            {uploads.length === 0 ? (
              <EmptyState
                icon={Image}
                title="No photos in gallery"
                description="Photos will appear here once you create content in the Editor"
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

          <TabsContent value="assets" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Brand rules and references used to keep all content visually and tonally consistent.
            </p>
            {assets.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="No brand kit assets"
                description="Add logos, brand guidelines, colour palettes, and visual references"
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
