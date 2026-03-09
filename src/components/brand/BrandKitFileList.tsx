import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Image, File, Download, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface BrandKitFile {
  id: string;
  file_name: string;
  file_type: string;
  category: string | null;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
}

interface BrandKitFileListProps {
  files: BrandKitFile[];
  canEdit: boolean;
  onDeleteComplete: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  guidelines: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  logo: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  voice: 'bg-green-500/20 text-green-400 border-green-500/30',
  fonts: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  palette: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  misc: 'bg-muted text-muted-foreground border-border',
};

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
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

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BrandKitFileList({ files, canEdit, onDeleteComplete }: BrandKitFileListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDownload = async (file: BrandKitFile) => {
    try {
      // Use signed URL since bucket is private (1 hour TTL)
      const { data } = await supabase.storage.from('venue-assets').createSignedUrl(file.storage_path, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (error) {
      toast({
        title: 'Download failed',
        description: 'Could not open file.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (file: BrandKitFile) => {
    setDeletingId(file.id);

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('venue-assets')
        .remove([file.storage_path]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
        // Continue to delete DB record even if storage fails
      }

      // Delete DB record
      const { error: dbError } = await supabase
        .from('brand_kit_files')
        .delete()
        .eq('id', file.id);

      if (dbError) {
        throw dbError;
      }

      toast({
        title: 'File deleted',
        description: `${file.file_name} has been removed.`,
      });

      onDeleteComplete();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not delete file.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {files.map((file, index) => {
        const FileIcon = getFileIcon(file.file_name);
        const category = file.category || 'misc';
        const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.misc;

        return (
          <motion.div
            key={file.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <FileIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.file_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className={`text-xs ${categoryColor}`}>
                    {category}
                  </Badge>
                  {file.size_bytes && (
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size_bytes)}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(file.created_at)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDownload(file)}
              >
                <Download className="w-4 h-4" />
              </Button>

              {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={deletingId === file.id}
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete file?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{file.file_name}" from your Brand Kit.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(file)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
