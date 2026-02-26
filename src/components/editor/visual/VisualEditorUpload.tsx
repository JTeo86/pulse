import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Image, X, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVisualEditor } from './VisualEditorContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

const vibeOptions = [
  { value: 'casual', label: 'Casual', description: 'Relaxed, welcoming atmosphere' },
  { value: 'premium', label: 'Premium', description: 'Upscale, refined experience' },
  { value: 'luxury', label: 'Luxury', description: 'Exclusive, high-end aesthetic' },
  { value: 'nightlife', label: 'Nightlife', description: 'Vibrant, energetic mood' },
  { value: 'family', label: 'Family', description: 'Warm, inclusive feeling' },
];

const goalOptions = [
  { value: 'clean-studio', label: 'Clean Studio Shot', description: 'Professional product photography' },
  { value: 'lifestyle', label: 'Lifestyle Integration', description: 'Natural environment setting' },
  { value: 'promo', label: 'Promo Creative', description: 'Marketing-ready with overlays' },
];

/** Convert a File to base64 string (without data: prefix) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function VisualEditorUpload() {
  const { state, addImages, removeImage, setStep, setPreset, updateImageUrl, setProcessing } = useVisualEditor();
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState('casual');
  const [selectedGoal, setSelectedGoal] = useState('clean-studio');
  const [autoProcessing, setAutoProcessing] = useState(false);

  // Fetch venue's brand presets
  const { data: presets } = useQuery({
    queryKey: ['brand-presets', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('brand_visual_presets')
        .select('*')
        .eq('venue_id', currentVenue.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentVenue,
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      addImages(files);
    }
  }, [addImages]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      addImages(files);
    }
  };

  const handleContinue = async () => {
    // Find matching preset
    const matchingPreset = presets?.find(p => p.vibe === selectedVibe);
    if (matchingPreset) {
      setPreset(matchingPreset.id);
    }

    if (!currentVenue || !user || state.images.length === 0) {
      setStep('edit');
      return;
    }

    // Auto-process: remove background on the hero image, then apply atmosphere background
    const heroImage = state.images[0];
    if (!heroImage?.file) {
      setStep('edit');
      return;
    }

    setAutoProcessing(true);
    setProcessing(true);

    try {
      // Step 1: Remove background
      const base64 = await fileToBase64(heroImage.file);
      const { data: cutoutData, error: cutoutErr } = await supabase.functions.invoke('photoroom-edit', {
        body: {
          sourceFileBase64: base64,
          sourceFileName: heroImage.file.name,
          operation: 'remove-background',
          venueId: currentVenue.id,
        },
      });

      if (cutoutErr) throw cutoutErr;

      const cutoutUrl = cutoutData?.resultUrl;
      if (!cutoutUrl) throw new Error('No cutout URL returned');

      // Step 2: Find best atmosphere background
      const { data: atmAssets } = await supabase
        .from('style_reference_assets')
        .select('storage_path, pinned')
        .eq('venue_id', currentVenue.id)
        .eq('channel', 'atmosphere')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

      let backgroundUrl: string | undefined;
      if (atmAssets && atmAssets.length > 0) {
        backgroundUrl = supabase.storage.from('venue_atmosphere').getPublicUrl(atmAssets[0].storage_path).data.publicUrl;
      }

      // Step 3: Replace background (or use neutral studio)
      const { data: replaceData, error: replaceErr } = await supabase.functions.invoke('photoroom-edit', {
        body: {
          sourceUrl: cutoutUrl,
          operation: 'replace-background',
          backgroundUrl,
          backgroundColor: backgroundUrl ? undefined : '#F5F5F0',
          venueId: currentVenue.id,
        },
      });

      if (replaceErr) throw replaceErr;

      if (replaceData?.resultUrl) {
        updateImageUrl(heroImage.id, replaceData.resultUrl);
        toast({
          title: 'Auto-processed',
          description: backgroundUrl
            ? 'Background removed and venue atmosphere applied'
            : 'Background removed and studio background applied',
        });
      }
    } catch (error: any) {
      console.error('Auto-process error:', error);
      toast({
        variant: 'destructive',
        title: 'Auto-processing failed',
        description: error.message || 'Moving to editor without processing',
      });
    } finally {
      setAutoProcessing(false);
      setProcessing(false);
    }

    setStep('edit');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-medium mb-2">Upload Your Photos</h2>
        <p className="text-muted-foreground">
          Drop your venue photos and we'll automatically remove backgrounds and apply your venue style
        </p>
      </div>

      {/* Drop Zone */}
      <motion.div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          relative p-10 rounded-xl border-2 border-dashed transition-all duration-200
          ${dragActive 
            ? 'border-accent bg-accent/5' 
            : 'border-border hover:border-accent/50 bg-muted/30'
          }
        `}
        whileHover={{ scale: 1.01 }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <Upload className="w-8 h-8 text-accent" />
          </div>
          <h3 className="font-medium mb-1">Drop photos here</h3>
          <p className="text-sm text-muted-foreground mb-4">
            PNG, JPG up to 10MB • Multiple files supported
          </p>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
            id="visual-editor-upload"
          />
          <Button asChild variant="outline" size="sm">
            <label htmlFor="visual-editor-upload" className="cursor-pointer">
              <Image className="w-4 h-4 mr-2" />
              Browse Files
            </label>
          </Button>
        </div>
      </motion.div>

      {/* Image Previews */}
      {state.images.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {state.images.map((img, index) => (
            <motion.div
              key={img.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="relative aspect-square rounded-lg overflow-hidden border border-border group"
            >
              <img src={img.originalUrl} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
              {index === 0 && (
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-xs font-medium">
                  Hero
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Style & Goal Selection */}
      {state.images.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid md:grid-cols-2 gap-6 p-6 rounded-xl bg-muted/30 border border-border"
        >
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Brand Vibe
            </Label>
            <Select value={selectedVibe} onValueChange={setSelectedVibe}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {vibeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label>Edit Goal</Label>
            <Select value={selectedGoal} onValueChange={setSelectedGoal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {goalOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      )}

      {/* Continue Button */}
      {state.images.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-end"
        >
          <Button onClick={handleContinue} size="lg" className="gap-2" disabled={autoProcessing}>
            {autoProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue to Editor
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
