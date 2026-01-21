import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload as UploadIcon, Image, X, ArrowRight, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface FilePreview {
  file: File;
  preview: string;
}

type Intent = 'standard' | 'announcement' | 'event' | 'menu_update' | 'seasonal';

const intentOptions = [
  { value: 'standard', label: 'Standard Post', description: 'Regular social media content' },
  { value: 'announcement', label: 'Announcement', description: 'News, updates, or offers' },
  { value: 'event', label: 'Event', description: 'Special events or occasions' },
  { value: 'menu_update', label: 'Menu Update', description: 'New dishes or menu changes' },
  { value: 'seasonal', label: 'Seasonal', description: 'Holiday or seasonal content' },
];

export default function UploadTab() {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [files, setFiles] = useState<FilePreview[]>([]);
  const [intent, setIntent] = useState<Intent>('standard');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFiles = (newFiles: File[]) => {
    const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
    const previews = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFiles(prev => [...prev, ...previews]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleUpload = async () => {
    if (!currentVenue || !user || files.length === 0) return;

    setUploading(true);
    try {
      for (const { file } of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const storagePath = `venues/${currentVenue.id}/uploads/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('venue-assets')
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from('uploads')
          .insert({
            venue_id: currentVenue.id,
            uploaded_by: user.id,
            storage_path: storagePath,
            notes: notes || null,
            status: 'new',
          });

        if (insertError) throw insertError;
      }

      toast({
        title: 'Photos uploaded successfully',
        description: `${files.length} photo${files.length > 1 ? 's' : ''} submitted for processing`,
      });

      files.forEach(f => URL.revokeObjectURL(f.preview));
      setFiles([]);
      setNotes('');
      setIntent('standard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          card-elevated p-8 text-center transition-all duration-200
          ${dragActive ? 'border-2 border-accent border-dashed bg-accent/5' : ''}
        `}
      >
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <UploadIcon className="w-8 h-8 text-accent" />
          </div>
          <h3 className="font-medium mb-1">Drop photos here</h3>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse your files
          </p>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              if (e.target.files) handleFiles(Array.from(e.target.files));
            }}
            className="hidden"
            id="file-upload-editor"
          />
          <Button asChild variant="outline">
            <label htmlFor="file-upload-editor" className="cursor-pointer">
              <Image className="w-4 h-4 mr-2" />
              Select photos
            </label>
          </Button>
        </div>
      </div>

      {/* File Previews */}
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {files.map((f, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-border">
              <img
                src={f.preview}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeFile(index)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Intent Selector */}
      <div className="card-elevated p-6 space-y-4">
        <div>
          <Label>Content intent *</Label>
          <p className="text-sm text-muted-foreground mb-3">
            What type of content should this become?
          </p>
        </div>
        <Select value={intent} onValueChange={(v) => setIntent(v as Intent)}>
          <SelectTrigger className="input-editorial">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {intentOptions.map(opt => (
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

      {/* Notes */}
      <div className="card-elevated p-6 space-y-4">
        <div>
          <Label>Notes (optional)</Label>
          <p className="text-sm text-muted-foreground mb-3">
            Add context or special instructions for the AI
          </p>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., This is our new summer cocktail..."
          className="input-editorial min-h-[80px]"
        />
      </div>

      {/* What happens next */}
      <div className="p-4 bg-muted/50 rounded-lg border border-border flex items-start gap-3">
        <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong>What happens next:</strong> Your photos will be processed by our AI 
          to create brand-consistent content. You'll find the drafts in the Review tab 
          where you can approve, request changes, or regenerate before anything goes live.
        </div>
      </div>

      {/* Submit */}
      <Button
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
        className="w-full btn-primary-editorial"
        size="lg"
      >
        {uploading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            Uploading...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Upload {files.length > 0 ? `${files.length} photo${files.length > 1 ? 's' : ''}` : 'photos'}
            <ArrowRight className="w-4 h-4" />
          </span>
        )}
      </Button>
    </div>
  );
}
