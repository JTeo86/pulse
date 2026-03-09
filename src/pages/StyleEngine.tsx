import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Image, Palette, Camera, Check } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StyleChannelUploader } from '@/components/style/StyleChannelUploader';
import { StyleIntelligencePanel } from '@/components/style/StyleIntelligencePanel';
import { StyleAssetCard } from '@/components/style/StyleAssetCard';
import { useStyleAssets } from '@/hooks/use-style-assets';
import { EmptyState } from '@/components/ui/empty-state';

export default function StyleEngine() {
  const { currentVenue, isAdmin } = useVenue();
  const [activeTab, setActiveTab] = useState('atmosphere');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title="Style Engine"
        description="Train the AI to understand your venue's visual identity. Upload reference images to generate on-brand content."
      />

      {/* Guidance Card */}
      <Card className="bg-accent/5 border-accent/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <h3 className="font-medium text-sm mb-1">How Style Engine Works</h3>
              <p className="text-sm text-muted-foreground">
                Upload reference images across categories. The AI analyzes your visual style — 
                lighting, colors, composition — and applies it when generating new content. 
                More references = better results.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="atmosphere" className="gap-2">
            <Image className="w-4 h-4" />
            <span className="hidden sm:inline">Atmosphere</span>
          </TabsTrigger>
          <TabsTrigger value="plating" className="gap-2">
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Plating</span>
          </TabsTrigger>
          <TabsTrigger value="brand" className="gap-2">
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline">Brand</span>
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <Check className="w-4 h-4" />
            <span className="hidden sm:inline">Approved</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atmosphere" className="mt-6">
          <ChannelSection
            title="Atmosphere References"
            description="Interior shots, ambience, lighting mood. These help the AI understand your venue's vibe."
            venueId={currentVenue?.id}
            channel="atmosphere"
            refreshKey={refreshKey}
            onUploadComplete={handleUploadComplete}
          />
        </TabsContent>

        <TabsContent value="plating" className="mt-6">
          <ChannelSection
            title="Plating References"
            description="Close-up food shots, plating styles, garnish patterns. Teaches the AI your presentation standards."
            venueId={currentVenue?.id}
            channel="plating"
            refreshKey={refreshKey}
            onUploadComplete={handleUploadComplete}
          />
        </TabsContent>

        <TabsContent value="brand" className="mt-6">
          <ChannelSection
            title="Brand Inspiration"
            description="Logo applications, marketing materials, competitor examples you admire. Defines your visual identity."
            venueId={currentVenue?.id}
            channel="brand"
            refreshKey={refreshKey}
            onUploadComplete={handleUploadComplete}
          />
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Approved Outputs</CardTitle>
              <CardDescription>
                AI-generated content you've approved. These reinforce what works for your venue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentVenue && (
                <StyleIntelligencePanel venueId={currentVenue.id} canEdit={isAdmin} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function ChannelSection({
  title,
  description,
  venueId,
  channel,
  canEdit,
  refreshKey,
  onUploadComplete,
}: {
  title: string;
  description: string;
  venueId: string | undefined;
  channel: 'atmosphere' | 'plating' | 'brand';
  canEdit: boolean;
  refreshKey: number;
  onUploadComplete: () => void;
}) {
}: {
  title: string;
  description: string;
  venueId: string | undefined;
  channel: 'atmosphere' | 'plating' | 'brand';
  refreshKey: number;
  onUploadComplete: () => void;
}) {
  const { assets, loading, refetch } = useStyleAssets(venueId, channel);

  const handleComplete = () => {
    refetch();
    onUploadComplete();
  };

  if (!venueId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StyleChannelUploader
          venueId={venueId}
          channel={channel}
          onComplete={handleComplete}
        />
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={Image}
            title="No references yet"
            description={`Upload ${channel} images to train the AI.`}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {assets.map((asset) => (
              <StyleAssetCard
                key={asset.id}
                asset={asset}
                onRefetch={refetch}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
