import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Upload } from 'lucide-react';

export default function GuestUploadPage() {
  const { venueId } = useParams();
  const [guestName, setGuestName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file || !venueId) return;
    setUploading(true);

    try {
      // Upload to storage
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `venues/${venueId}/guest/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('venue-assets')
        .upload(path, file, { contentType: file.type });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('venue-assets').getPublicUrl(path);

      // Insert submission (uses anon key, RLS allows public insert)
      const { error: insertErr } = await supabase.from('guest_submissions').insert({
        venue_id: venueId,
        guest_name: guestName || null,
        image_url: urlData.publicUrl,
        status: 'pending',
      });

      if (insertErr) throw insertErr;
      setSuccess(true);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Thank you!</h2>
            <p className="text-muted-foreground">
              Your photo has been submitted. The venue team will review it shortly.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => { setSuccess(false); setFile(null); setPreview(null); setGuestName(''); }}
            >
              Submit Another Photo
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <Camera className="w-6 h-6 text-accent" />
          </div>
          <CardTitle className="text-xl">Share Your Photo</CardTitle>
          <CardDescription>
            Upload a photo from your visit. It may be featured on our social channels!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Your Name (optional)</Label>
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div>
            <Label>Photo</Label>
            <div
              className="mt-1 border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent/50 transition-colors"
              onClick={() => document.getElementById('guest-file-input')?.click()}
            >
              {preview ? (
                <img src={preview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg" />
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Tap to select a photo</p>
                </div>
              )}
            </div>
            <input
              id="guest-file-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <Button
            className="w-full"
            disabled={!file || uploading}
            onClick={handleSubmit}
          >
            {uploading ? 'Uploading…' : 'Submit Photo'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By submitting, you agree to allow the venue to use your photo for marketing purposes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
