import { useState, useRef } from 'react';
import { Upload, ImageIcon, X, Film, FolderOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AssetPickerModal } from '@/components/planner/AssetPickerModal';
import type { ContentAsset } from '@/hooks/use-content-assets';

export interface SelectedMedia {
  /** Resolved display URL */
  url: string;
  /** content_asset id if from library */
  assetId?: string;
  /** storage path if freshly uploaded */
  storagePath?: string;
  /** file name or title */
  label: string;
  /** 'image' | 'video' */
  type: 'image' | 'video';
}

interface CalendarMediaPickerProps {
  value: SelectedMedia | null;
  onChange: (media: SelectedMedia | null) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

export function CalendarMediaPicker({ value, onChange }: CalendarMediaPickerProps) {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentVenue || !user) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `venues/${currentVenue.id}/calendar/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('venue-assets')
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from('venue-assets')
        .createSignedUrl(storagePath, 3600);

      const isVideo = file.type.startsWith('video/');

      onChange({
        url: signed?.signedUrl || '',
        storagePath,
        label: file.name,
        type: isVideo ? 'video' : 'image',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLibrarySelect = (asset: ContentAsset) => {
    onChange({
      url: asset._resolvedUrl || asset.public_url || '',
      assetId: asset.id,
      label: asset.title || asset.source_type || 'Content asset',
      type: asset.asset_type === 'video' ? 'video' : 'image',
    });
  };

  if (value) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Media</label>
        <div className="relative rounded-lg border border-border overflow-hidden bg-muted">
          {value.type === 'video' ? (
            <div className="aspect-video flex items-center justify-center bg-muted">
              <Film className="w-10 h-10 text-muted-foreground/40" />
              <span className="absolute bottom-2 left-2 text-xs bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded">
                {value.label}
              </span>
            </div>
          ) : (
            <div className="aspect-video relative">
              <img
                src={value.url}
                alt={value.label}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-7 w-7"
              onClick={() => onChange(null)}
              title="Remove media"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="p-2 border-t border-border bg-background flex items-center justify-between">
            <span className="text-xs text-muted-foreground truncate max-w-[60%]">{value.label}</span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3 h-3" /> Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => setLibraryOpen(true)}
              >
                <FolderOpen className="w-3 h-3" /> Content
              </Button>
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
        <AssetPickerModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Media <span className="text-muted-foreground text-xs font-normal">(optional)</span>
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2 h-auto py-3"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploading ? 'Uploading…' : 'Upload New'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2 h-auto py-3"
          onClick={() => setLibraryOpen(true)}
          disabled={uploading}
        >
          <FolderOpen className="w-4 h-4" />
          From Content
        </Button>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
      <AssetPickerModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
    </div>
  );
}
