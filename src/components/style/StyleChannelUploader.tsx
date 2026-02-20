import { useRef } from 'react';
import { Upload, Loader2, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StyleChannel } from '@/types/style-intelligence';
import { useStyleUpload } from '@/hooks/use-style-upload';

interface StyleChannelUploaderProps {
  venueId: string;
  channel: StyleChannel;
  onComplete: () => void;
}

export function StyleChannelUploader({ venueId, channel, onComplete }: StyleChannelUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, uploadFile } = useStyleUpload({ venueId, channel, onComplete });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{progress || 'Uploading…'}</span>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="gap-2"
        >
          <ImagePlus className="w-4 h-4" />
          Add Images
        </Button>
      )}
    </div>
  );
}
