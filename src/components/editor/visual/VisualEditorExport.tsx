import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, 
  ArrowLeft, 
  Check,
  Square,
  RectangleVertical,
  Smartphone,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVisualEditor, ExportFormat } from './VisualEditorContext';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const exportFormats: { 
  value: ExportFormat; 
  label: string; 
  description: string;
  ratio: string;
  icon: typeof Square;
}[] = [
  { 
    value: 'ig-post', 
    label: 'Instagram Post', 
    description: '1080 × 1350px',
    ratio: '4:5',
    icon: RectangleVertical,
  },
  { 
    value: 'ig-story', 
    label: 'Instagram Story', 
    description: '1080 × 1920px',
    ratio: '9:16',
    icon: Smartphone,
  },
  { 
    value: 'reel-cover', 
    label: 'Reel Cover', 
    description: '1080 × 1920px',
    ratio: '9:16',
    icon: Smartphone,
  },
];

export default function VisualEditorExport() {
  const { state, setStep, reset } = useVisualEditor();
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(['ig-post']);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const toggleFormat = (format: ExportFormat) => {
    setSelectedFormats(prev =>
      prev.includes(format)
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleExport = async () => {
    if (!currentVenue || !user || state.images.length === 0) return;

    setExporting(true);
    try {
      // For each image, create content_items entries
      for (const img of state.images) {
        const imageUrl = img.editedUrl || img.originalUrl;

        // Create content item for drafts
        const { error } = await supabase
          .from('content_items')
          .insert({
            venue_id: currentVenue.id,
            media_master_url: imageUrl,
            media_variants: {
              formats: selectedFormats,
              urls: selectedFormats.map(f => ({
                format: f,
                url: imageUrl, // In production, would generate actual variants
              })),
            },
            status: 'draft',
            asset_type: 'static',
            intent: 'standard',
          });

        if (error) throw error;
      }

      // Log audit
      await supabase.from('audit_log').insert({
        venue_id: currentVenue.id,
        user_id: user.id,
        action: 'export_visual_editor',
        entity_type: 'content_items',
        meta: {
          image_count: state.images.length,
          formats: selectedFormats,
        },
      });

      setExported(true);
      toast({
        title: 'Export complete',
        description: `${state.images.length} image(s) added to drafts for review`,
      });

    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: error.message,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleStartNew = () => {
    reset();
  };

  if (exported) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4"
        >
          <Check className="w-8 h-8 text-green-500" />
        </motion.div>
        <h2 className="text-xl font-medium mb-2">Export Complete!</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Your edited images have been added to the Drafts tab for final review and publishing.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleStartNew}>
            Edit More Photos
          </Button>
          <Button onClick={() => setStep('upload')}>
            Go to Drafts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" size="sm" onClick={() => setStep('edit')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Editor
        </Button>
      </div>

      <div className="text-center mb-8">
        <h2 className="text-xl font-medium mb-2">Export Your Content</h2>
        <p className="text-muted-foreground">
          Choose output formats and send to drafts for review
        </p>
      </div>

      {/* Preview */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {state.images.map((img) => (
          <div
            key={img.id}
            className="aspect-[4/5] rounded-lg overflow-hidden border border-border"
          >
            <img
              src={img.editedUrl || img.originalUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Format Selection */}
      <div className="space-y-4 mb-8">
        <h3 className="font-medium">Output Formats</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {exportFormats.map(format => (
            <button
              key={format.value}
              onClick={() => toggleFormat(format.value)}
              className={cn(
                "p-4 rounded-lg border-2 transition-all text-left",
                selectedFormats.includes(format.value)
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-accent/50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  selectedFormats.includes(format.value)
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted"
                )}>
                  <format.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{format.label}</p>
                  <p className="text-xs text-muted-foreground">{format.ratio}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{format.description}</p>
              {selectedFormats.includes(format.value) && (
                <div className="mt-2">
                  <Check className="w-4 h-4 text-accent" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Export Summary */}
      <div className="p-4 rounded-lg bg-muted/50 border border-border mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Export Summary</p>
            <p className="text-sm text-muted-foreground">
              {state.images.length} image(s) × {selectedFormats.length} format(s) = {state.images.length * selectedFormats.length} outputs
            </p>
          </div>
          <Button
            onClick={handleExport}
            disabled={selectedFormats.length === 0 || exporting}
            size="lg"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export to Drafts
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Info */}
      <p className="text-sm text-muted-foreground text-center">
        Exports will appear in the Drafts & Review tab where you can add captions and publish.
      </p>
    </div>
  );
}
