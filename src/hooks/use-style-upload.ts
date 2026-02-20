import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { StyleChannel, StyleReferenceAsset, CHANNEL_BUCKETS } from '@/types/style-intelligence';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** Resize an image client-side and return a WebP blob */
async function resizeImageToWebP(
  file: File,
  maxPx: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/webp',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

interface UseStyleUploadOptions {
  venueId: string;
  channel: StyleChannel;
  onComplete: () => void;
}

export function useStyleUpload({ venueId, channel, onComplete }: UseStyleUploadOptions) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const uploadFile = useCallback(async (file: File) => {
    if (!user) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Only JPG, PNG, and WebP images are supported.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 5MB.' });
      return;
    }

    setUploading(true);
    try {
      const bucket = CHANNEL_BUCKETS[channel];
      const id = crypto.randomUUID();
      const basePath = `venues/${venueId}/style/${channel}/${id}`;

      // 1. Resize to analysis asset (1280px WebP q=75)
      setProgress('Compressing image…');
      const analysisBlob = await resizeImageToWebP(file, 1280, 0.75);
      const thumbnailBlob = await resizeImageToWebP(file, 480, 0.70);

      const analysisPath = `${basePath}/analysis.webp`;
      const thumbnailPath = `${basePath}/thumb.webp`;

      // 2. Upload both to storage
      setProgress('Uploading…');
      const [uploadRes, thumbRes] = await Promise.all([
        supabase.storage.from(bucket).upload(analysisPath, analysisBlob, { contentType: 'image/webp', upsert: false }),
        supabase.storage.from(bucket).upload(thumbnailPath, thumbnailBlob, { contentType: 'image/webp', upsert: false }),
      ]);
      if (uploadRes.error) throw uploadRes.error;
      if (thumbRes.error) throw thumbRes.error;

      // 3. Insert DB record
      setProgress('Saving…');
      const { data: asset, error: insertErr } = await supabase
        .from('style_reference_assets')
        .insert({
          venue_id: venueId,
          channel,
          type: 'image',
          storage_path: analysisPath,
          thumbnail_path: thumbnailPath,
          created_by: user.id,
          status: 'pending_analysis',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 4. Trigger analysis edge function
      setProgress('Analyzing with AI…');
      const authResp = await supabase.auth.getSession();
      const token = authResp.data.session?.access_token;
      if (!token) throw new Error('No auth token');

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-style-asset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ asset_id: asset.id }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        console.warn('Analysis failed (non-blocking):', errData.error);
        // Don't throw – upload succeeded, analysis can retry
      }

      toast({ title: 'Reference uploaded', description: 'AI analysis is processing.' });
      onComplete();
    } catch (error: any) {
      console.error('Style upload error:', error);
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
    } finally {
      setUploading(false);
      setProgress('');
    }
  }, [user, venueId, channel, onComplete, toast]);

  return { uploading, progress, uploadFile };
}
