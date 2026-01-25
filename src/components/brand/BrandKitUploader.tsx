import { useState, useRef } from 'react';
import { Upload, FileText, Image, File, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BrandKitUploaderProps {
  venueId: string;
  onUploadComplete: () => void;
}

const ALLOWED_TYPES: Record<string, string[]> = {
  // Documents
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  // Images/Logos
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/svg+xml': ['.svg'],
  'image/webp': ['.webp'],
  // Fonts
  'font/ttf': ['.ttf'],
  'font/otf': ['.otf'],
  'application/x-font-ttf': ['.ttf'],
  'application/x-font-otf': ['.otf'],
};

const ACCEPT_STRING = Object.values(ALLOWED_TYPES).flat().join(',');

const CATEGORY_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'guidelines',
  '.doc': 'guidelines',
  '.docx': 'guidelines',
  '.txt': 'voice',
  '.md': 'voice',
  '.png': 'logo',
  '.jpg': 'logo',
  '.jpeg': 'logo',
  '.svg': 'logo',
  '.webp': 'logo',
  '.ttf': 'fonts',
  '.otf': 'fonts',
};

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
}

function getCategoryFromFilename(filename: string): string {
  const ext = getFileExtension(filename);
  return CATEGORY_BY_EXTENSION[ext] || 'misc';
}

function getFileIcon(filename: string) {
  const ext = getFileExtension(filename);
  if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext)) {
    return Image;
  }
  if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext)) {
    return FileText;
  }
  return File;
}

export function BrandKitUploader({ venueId, onUploadComplete }: BrandKitUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach((file) => {
      const ext = getFileExtension(file.name);
      const isValidType = Object.values(ALLOWED_TYPES).flat().includes(ext);
      
      if (isValidType) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      toast({
        title: 'Some files not supported',
        description: `Skipped: ${invalidFiles.join(', ')}`,
        variant: 'destructive',
      });
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Authentication required',
          description: 'Please sign in to upload files.',
          variant: 'destructive',
        });
        return;
      }

      for (const file of selectedFiles) {
        const fileId = crypto.randomUUID();
        const storagePath = `venues/${venueId}/brand-kit/${fileId}-${file.name}`;
        const category = getCategoryFromFilename(file.name);

        // Upload to storage
        const { error: storageError } = await supabase.storage
          .from('venue-assets')
          .upload(storagePath, file);

        if (storageError) {
          console.error('Storage error:', storageError);
          toast({
            title: 'Upload failed',
            description: `Could not upload ${file.name}: ${storageError.message}`,
            variant: 'destructive',
          });
          continue;
        }

        // Insert DB record
        const { error: dbError } = await supabase
          .from('brand_kit_files')
          .insert({
            venue_id: venueId,
            uploaded_by: user.id,
            file_name: file.name,
            file_type: file.type || getFileExtension(file.name),
            category,
            storage_path: storagePath,
            size_bytes: file.size,
          });

        if (dbError) {
          console.error('DB error:', dbError);
          // Try to clean up storage
          await supabase.storage.from('venue-assets').remove([storagePath]);
          
          toast({
            title: 'Upload failed',
            description: `Could not save ${file.name}: ${dbError.message}`,
            variant: 'destructive',
          });
          continue;
        }
      }

      toast({
        title: 'Upload complete',
        description: `${selectedFiles.length} file(s) uploaded to Brand Kit.`,
      });

      setSelectedFiles([]);
      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone / file input */}
      <div
        className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-accent/50 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Click to upload or drag and drop</p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOC, TXT, PNG, JPG, SVG, TTF, OTF
        </p>
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{selectedFiles.length} file(s) selected</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => {
              const FileIcon = getFileIcon(file.name);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full btn-primary-editorial"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload {selectedFiles.length} file(s)
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
