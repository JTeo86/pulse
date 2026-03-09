import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Image, Palette, Camera, Check } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StyleChannelUploader } from '@/components/style/StyleChannelUploader';
import { StyleProfileSummary } from '@/components/style/StyleProfileSummary';
import { StyleIntelligencePanel } from '@/components/style/StyleIntelligencePanel';

export default function StyleEngine() {
  const { currentVenue, isAdmin } = useVenue();
  const [activeTab, setActiveTab] = useState('atmosphere');

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

      {/* Style Profile Summary */}
      {currentVenue && <StyleProfileSummary venueId={currentVenue.id} />}

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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Atmosphere References</CardTitle>
              <CardDescription>
                Interior shots, ambience, lighting mood. These help the AI understand your venue's vibe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentVenue && (
                <StyleChannelUploader 
                  venueId={currentVenue.id} 
                  channel="atmosphere" 
                  canEdit={isAdmin}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plating" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plating References</CardTitle>
              <CardDescription>
                Close-up food shots, plating styles, garnish patterns. Teaches the AI your presentation standards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentVenue && (
                <StyleChannelUploader 
                  venueId={currentVenue.id} 
                  channel="plating" 
                  canEdit={isAdmin}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brand" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Brand Inspiration</CardTitle>
              <CardDescription>
                Logo applications, marketing materials, competitor examples you admire. Defines your visual identity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentVenue && (
                <StyleChannelUploader 
                  venueId={currentVenue.id} 
                  channel="brand" 
                  canEdit={isAdmin}
                />
              )}
            </CardContent>
          </Card>
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
                <StyleIntelligencePanel venueId={currentVenue.id} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
