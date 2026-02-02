import { motion } from 'framer-motion';
import { 
  Sparkles, 
  Eraser, 
  ImageIcon, 
  Palette, 
  Type,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVisualEditor, EditOperation } from './VisualEditorContext';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const editTabs: { value: EditOperation; label: string; icon: typeof Sparkles }[] = [
  { value: 'enhance', label: 'Enhance', icon: Sparkles },
  { value: 'cleanup', label: 'Cleanup', icon: Eraser },
  { value: 'background', label: 'Background', icon: ImageIcon },
  { value: 'brand-style', label: 'Brand Style', icon: Palette },
  { value: 'promo-overlay', label: 'Overlay', icon: Type },
];

export default function VisualEditorCanvas() {
  const { 
    state, 
    setStep, 
    selectImage, 
    setActiveOperation,
    updateImageUrl,
    setBackgroundAsset,
    setProcessing 
  } = useVisualEditor();
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const selectedImage = state.images.find(img => img.id === state.selectedImageId);
  const currentImageUrl = selectedImage?.editedUrl || selectedImage?.originalUrl;

  // Fetch background assets
  const { data: backgrounds } = useQuery({
    queryKey: ['background-assets', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      
      // Get venue-specific and global approved backgrounds
      const { data, error } = await supabase
        .from('background_assets')
        .select('*')
        .or(`venue_id.eq.${currentVenue.id},and(venue_id.is.null,allow_in_production.eq.true,commercial_safe_status.eq.approved)`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentVenue,
  });

  const handlePhotoRoomEdit = async (operation: 'remove-background' | 'replace-background' | 'enhance', backgroundUrl?: string) => {
    if (!selectedImage || !currentVenue || !user) return;

    setProcessing(true);
    try {
      // Get the current image URL - if it's a blob, we need to upload first
      let sourceUrl = currentImageUrl;
      
      if (sourceUrl?.startsWith('blob:') && selectedImage.file) {
        // Upload the file first
        const fileExt = selectedImage.file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const storagePath = `venues/${currentVenue.id}/uploads/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('venue-assets')
          .upload(storagePath, selectedImage.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('venue-assets')
          .getPublicUrl(storagePath);

        sourceUrl = publicUrl;
      }

      const { data, error } = await supabase.functions.invoke('photoroom-edit', {
        body: {
          sourceUrl,
          operation,
          backgroundUrl,
          venueId: currentVenue.id,
        },
      });

      if (error) throw error;

      if (data.resultUrl) {
        updateImageUrl(selectedImage.id, data.resultUrl);
        toast({
          title: 'Edit applied',
          description: `${operation.replace('-', ' ')} completed successfully`,
        });
      }
    } catch (error: any) {
      console.error('Edit error:', error);
      toast({
        variant: 'destructive',
        title: 'Edit failed',
        description: error.message || 'Failed to process image',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = () => {
    if (selectedImage) {
      updateImageUrl(selectedImage.id, selectedImage.originalUrl);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {state.isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRevert} disabled={!selectedImage?.editedUrl}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Revert
          </Button>
          <Button size="sm" onClick={() => setStep('export')} disabled={state.isProcessing}>
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Image Selection */}
        <div className="w-24 border-r border-border p-2 overflow-y-auto">
          <div className="space-y-2">
            {state.images.map((img, index) => (
              <button
                key={img.id}
                onClick={() => selectImage(img.id)}
                className={cn(
                  "w-full aspect-square rounded-lg overflow-hidden border-2 transition-all",
                  img.id === state.selectedImageId 
                    ? "border-accent ring-2 ring-accent/20" 
                    : "border-transparent hover:border-border"
                )}
              >
                <img
                  src={img.editedUrl || img.originalUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
          {selectedImage && (
            <motion.div
              key={selectedImage.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative max-w-2xl w-full"
            >
              <AspectRatio ratio={4/5} className="bg-black rounded-lg overflow-hidden shadow-2xl">
                <img
                  src={currentImageUrl}
                  alt=""
                  className="w-full h-full object-contain"
                />
                {state.isProcessing && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-accent" />
                      <p className="text-sm text-muted-foreground">Applying edits...</p>
                    </div>
                  </div>
                )}
              </AspectRatio>
            </motion.div>
          )}
        </div>

        {/* Right Sidebar - Edit Tools */}
        <div className="w-80 border-l border-border">
          <Tabs 
            value={state.activeOperation || 'enhance'} 
            onValueChange={(v) => setActiveOperation(v as EditOperation)}
            className="h-full flex flex-col"
          >
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0">
              {editTabs.map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent py-3"
                >
                  <tab.icon className="w-4 h-4" />
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Enhance Tab */}
            <TabsContent value="enhance" className="flex-1 p-4 m-0">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Auto-Enhance</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Automatically improve lighting, colors, and sharpness
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handlePhotoRoomEdit('enhance')}
                  disabled={state.isProcessing}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Apply Enhancement
                </Button>
              </div>
            </TabsContent>

            {/* Cleanup Tab */}
            <TabsContent value="cleanup" className="flex-1 p-4 m-0">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Remove Background</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Cleanly extract your subject from the background
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handlePhotoRoomEdit('remove-background')}
                  disabled={state.isProcessing}
                >
                  <Eraser className="w-4 h-4 mr-2" />
                  Remove Background
                </Button>
              </div>
            </TabsContent>

            {/* Background Tab */}
            <TabsContent value="background" className="flex-1 p-4 m-0 overflow-hidden">
              <div className="space-y-4 h-full flex flex-col">
                <div>
                  <h3 className="font-medium mb-1">Replace Background</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a commercially-safe background
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-2 gap-2">
                    {backgrounds?.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => {
                          setBackgroundAsset(bg.id);
                          handlePhotoRoomEdit('replace-background', bg.file_url);
                        }}
                        className={cn(
                          "aspect-video rounded-lg overflow-hidden border-2 transition-all",
                          state.backgroundAssetId === bg.id
                            ? "border-accent ring-2 ring-accent/20"
                            : "border-transparent hover:border-border"
                        )}
                        disabled={state.isProcessing}
                      >
                        <img
                          src={bg.file_url}
                          alt={bg.name}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  {(!backgrounds || backgrounds.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No backgrounds available. Add some in Platform Admin.
                    </p>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Brand Style Tab */}
            <TabsContent value="brand-style" className="flex-1 p-4 m-0">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Brand Style</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Apply your venue's visual preset
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 border border-border text-center">
                  <Palette className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Color grading and style presets coming soon
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Promo Overlay Tab */}
            <TabsContent value="promo-overlay" className="flex-1 p-4 m-0">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">Promo Overlay</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add text overlays with compliance check
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 border border-border text-center">
                  <Type className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Text overlays with compliance guardrails coming soon
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
