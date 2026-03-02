import { useState } from 'react';
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
  RotateCcw,
  Camera,
  Info,
  Pin
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
import StyleInputsPanel from './StyleInputsPanel';

const editTabs: { value: EditOperation; label: string; icon: typeof Sparkles }[] = [
  { value: 'enhance', label: 'Enhance', icon: Sparkles },
  { value: 'cleanup', label: 'Cleanup', icon: Eraser },
  { value: 'background', label: 'Background', icon: ImageIcon },
  { value: 'brand-style', label: 'Brand Style', icon: Palette },
  { value: 'promo-overlay', label: 'Overlay', icon: Type },
];

/** Convert a File to base64 string (without data: prefix) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:... prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const [proPhotoLoading, setProPhotoLoading] = useState(false);

  const selectedImage = state.images.find(img => img.id === state.selectedImageId);
  const currentImageUrl = selectedImage?.editedUrl || selectedImage?.originalUrl;

  // Fetch atmosphere assets from Style Intelligence
  const { data: atmosphereAssets } = useQuery({
    queryKey: ['atmosphere-assets', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('style_reference_assets')
        .select('*, analysis:style_analysis(*)')
        .eq('venue_id', currentVenue.id)
        .eq('channel', 'atmosphere')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Enrich with public URLs from venue_atmosphere bucket
      return (data || []).map((row: any) => {
        const pub = supabase.storage.from('venue_atmosphere').getPublicUrl(row.storage_path).data.publicUrl;
        const thumb = row.thumbnail_path
          ? supabase.storage.from('venue_atmosphere').getPublicUrl(row.thumbnail_path).data.publicUrl
          : pub;
        return { ...row, publicUrl: pub, thumbnailUrl: thumb };
      });
    },
    enabled: !!currentVenue,
  });

  // Fallback: commercial-safe platform backgrounds
  const { data: fallbackBackgrounds } = useQuery({
    queryKey: ['fallback-backgrounds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('background_assets')
        .select('*')
        .eq('allow_in_production', true)
        .eq('commercial_safe_status', 'approved')
        .is('venue_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !atmosphereAssets || atmosphereAssets.length === 0,
  });

  // Fetch style context for the panel
  const { data: styleContext } = useQuery({
    queryKey: ['style-context', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [brandRes, profileRes, atmCountRes, platCountRes] = await Promise.all([
        supabase.from('brand_kits').select('preset, rules_text').eq('venue_id', currentVenue.id).single(),
        supabase.from('venue_style_profile').select('*').eq('venue_id', currentVenue.id).single(),
        supabase.from('style_reference_assets').select('id', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('channel', 'atmosphere'),
        supabase.from('style_reference_assets').select('id', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('channel', 'plating'),
      ]);
      return {
        brandPreset: brandRes.data?.preset || 'casual',
        brandRules: brandRes.data?.rules_text || null,
        atmosphereCount: atmCountRes.count || 0,
        platingCount: platCountRes.count || 0,
        hasProfile: !!profileRes.data,
      };
    },
    enabled: !!currentVenue,
  });

  const handlePhotoRoomEdit = async (operation: 'remove-background' | 'replace-background' | 'enhance', backgroundUrl?: string) => {
    if (!selectedImage || !currentVenue || !user) return;

    setProcessing(true);
    try {
      // Build request body — send base64 if file is a blob
      const body: any = {
        operation,
        backgroundUrl,
        venueId: currentVenue.id,
      };

      const sourceUrl = currentImageUrl;
      if (sourceUrl?.startsWith('blob:') && selectedImage.file) {
        body.sourceFileBase64 = await fileToBase64(selectedImage.file);
        body.sourceFileName = selectedImage.file.name;
      } else {
        body.sourceUrl = sourceUrl;
      }

      const { data, error } = await supabase.functions.invoke('photoroom-edit', { body });
      if (error) throw error;

      if (data.resultUrl) {
        updateImageUrl(selectedImage.id, data.resultUrl);
        toast({
          title: 'Edit applied',
          description: `${operation.replace(/-/g, ' ')} completed successfully`,
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

  const handleGenerateProPhoto = async () => {
    if (!selectedImage || !currentVenue || !user) return;

    setProPhotoLoading(true);
    setProcessing(true);
    try {
      const body: any = {
        venue_id: currentVenue.id,
        style_preset: styleContext?.brandPreset || 'casual',
        realism_mode: true,
      };

      const sourceUrl = currentImageUrl;
      if (selectedImage.file && (!sourceUrl || sourceUrl.startsWith('blob:'))) {
        body.sourceFileBase64 = await fileToBase64(selectedImage.file);
        body.sourceFileName = selectedImage.file.name;
      } else if (sourceUrl) {
        body.input_image_url = sourceUrl;
      } else {
        throw new Error('No image source available');
      }

      const { data, error } = await supabase.functions.invoke('editor-generate-pro-photo', { body });
      if (error) throw error;

      if (data.final_image_url) {
        updateImageUrl(selectedImage.id, data.final_image_url);
        const bgLabel = data.background_mode === 'atmosphere_ref'
          ? 'Style Intelligence (Atmosphere)'
          : data.background_mode === 'brand_generated'
            ? 'AI Generated (Brand Identity)'
            : data.background_mode || 'studio';
        toast({
          title: 'Pro Photo generated',
          description: `Background: ${bgLabel}${data.gemini_used ? ' • AI polished' : ''}`,
        });
      }
    } catch (error: any) {
      console.error('Pro Photo error:', error);
      toast({
        variant: 'destructive',
        title: 'Pro Photo failed',
        description: error.message || 'Failed to generate pro photo',
      });
    } finally {
      setProPhotoLoading(false);
      setProcessing(false);
    }
  };

  const handleRevert = () => {
    if (selectedImage) {
      updateImageUrl(selectedImage.id, selectedImage.originalUrl);
    }
  };

  const backgrounds = atmosphereAssets && atmosphereAssets.length > 0 ? atmosphereAssets : null;
  const showFallback = !backgrounds;

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {(state.isProcessing || proPhotoLoading) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {proPhotoLoading ? 'Generating Pro Photo...' : 'Processing...'}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRevert} disabled={!selectedImage?.editedUrl}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Revert
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleGenerateProPhoto}
            disabled={state.isProcessing || proPhotoLoading}
            className="bg-gradient-to-r from-accent to-accent/80 gap-2"
          >
            <Camera className="w-4 h-4" />
            Generate Pro Photo
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
            {state.images.map((img) => (
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
        <div className="flex-1 flex flex-col">
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
                  {(state.isProcessing || proPhotoLoading) && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                        <p className="text-sm text-muted-foreground">
                          {proPhotoLoading ? 'Generating Pro Photo...' : 'Applying edits...'}
                        </p>
                      </div>
                    </div>
                  )}
                </AspectRatio>
              </motion.div>
            )}
          </div>

          {/* Style Inputs Panel */}
          {styleContext && (
            <StyleInputsPanel
              brandPreset={styleContext.brandPreset}
              atmosphereCount={styleContext.atmosphereCount}
              platingCount={styleContext.platingCount}
              hasProfile={styleContext.hasProfile}
            />
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

            {/* Background Tab - Now uses atmosphere assets */}
            <TabsContent value="background" className="flex-1 p-4 m-0 overflow-hidden">
              <div className="space-y-4 h-full flex flex-col">
                <div>
                  <h3 className="font-medium mb-1">Replace Background</h3>
                  <p className="text-sm text-muted-foreground">
                    {backgrounds ? 'Your venue atmosphere references' : 'Choose a background'}
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  {backgrounds && (
                    <div className="grid grid-cols-2 gap-2">
                      {backgrounds.map((bg: any) => (
                        <button
                          key={bg.id}
                          onClick={() => {
                            setBackgroundAsset(bg.id);
                            handlePhotoRoomEdit('replace-background', bg.publicUrl);
                          }}
                          className={cn(
                            "aspect-video rounded-lg overflow-hidden border-2 transition-all relative",
                            state.backgroundAssetId === bg.id
                              ? "border-accent ring-2 ring-accent/20"
                              : "border-transparent hover:border-border"
                          )}
                          disabled={state.isProcessing}
                        >
                          <img src={bg.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                          {bg.pinned && (
                            <div className="absolute top-1 right-1">
                              <Pin className="w-3 h-3 text-accent" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {showFallback && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-muted/50 border border-border text-center">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium mb-1">No Venue Atmosphere references uploaded yet</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Upload atmosphere photos in Brand Identity → Style Intelligence
                        </p>
                      </div>
                      
                      {/* Neutral studio option */}
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handlePhotoRoomEdit('replace-background')}
                        disabled={state.isProcessing}
                      >
                        Use neutral studio background
                      </Button>

                      {/* Platform fallback backgrounds */}
                      {fallbackBackgrounds && fallbackBackgrounds.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground font-medium">Platform defaults</p>
                          <div className="grid grid-cols-2 gap-2">
                            {fallbackBackgrounds.map((bg) => (
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
                                <img src={bg.file_url} alt={bg.name} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
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
