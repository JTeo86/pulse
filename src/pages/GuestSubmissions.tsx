import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Camera, CheckCircle2, XCircle, Clock, QrCode, Copy, Sparkles, Download } from 'lucide-react';
import { format } from 'date-fns';

function QRCodeSVG({ url, size = 200 }: { url: string; size?: number }) {
  // Simple QR placeholder using a third-party URL-based QR generator
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&format=svg`;
  return <img src={qrUrl} alt="QR Code" width={size} height={size} className="rounded-lg" />;
}

export default function GuestSubmissions() {
  const { currentVenue } = useVenue();
  const qc = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);

  const guestUploadUrl = `${window.location.origin}/submit/${currentVenue?.id}`;

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['guest-submissions', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('guest_submissions')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('guest_submissions')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      // If approving, trigger AI enhancement
      if (status === 'approved') {
        try {
          await supabase.functions.invoke('enhance-guest-submission', {
            body: { submissionId: id },
          });
        } catch (err) {
          console.warn('AI enhancement failed, submission still approved:', err);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-submissions'] });
      toast.success('Submission updated');
    },
    onError: (e) => toast.error(e.message),
  });

  const pending = submissions?.filter(s => s.status === 'pending') ?? [];
  const approved = submissions?.filter(s => s.status === 'approved') ?? [];

  const downloadQR = () => {
    const link = document.createElement('a');
    link.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(guestUploadUrl)}&format=png`;
    link.download = `guest-upload-qr-${currentVenue?.id}.png`;
    link.click();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Guest Photos"
        description="Review and approve guest-submitted photos for your content library."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
              <QrCode className="w-4 h-4 mr-1.5" /> QR Code
            </Button>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(guestUploadUrl); toast.success('Link copied!'); }}>
              <Copy className="w-4 h-4 mr-1.5" /> Copy Link
            </Button>
            <Badge variant="outline" className="text-xs">{pending.length} pending</Badge>
          </div>
        }
      />

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guest Upload QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <QRCodeSVG url={guestUploadUrl} size={240} />
            <p className="text-sm text-muted-foreground text-center">
              Print this QR code and place it on tables or at the entrance. Guests can scan to upload photos of their visit.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadQR}>
                <Download className="w-4 h-4 mr-1.5" /> Download PNG
              </Button>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(guestUploadUrl); toast.success('Link copied!'); }}>
                <Copy className="w-4 h-4 mr-1.5" /> Copy Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><Clock className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{pending.length}</p><p className="text-xs text-muted-foreground">Pending Review</p></CardContent></Card>
        <Card><CardContent className="p-4"><CheckCircle2 className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{approved.length}</p><p className="text-xs text-muted-foreground">Approved</p></CardContent></Card>
        <Card><CardContent className="p-4"><Camera className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{submissions?.length ?? 0}</p><p className="text-xs text-muted-foreground">Total Submissions</p></CardContent></Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      ) : !submissions?.length ? (
        <EmptyState
          icon={Camera}
          title="No guest submissions yet"
          description="Share your guest upload QR code or link to start receiving photos from your guests."
          action={
            <Button variant="outline" onClick={() => setQrOpen(true)}>
              <QrCode className="w-4 h-4 mr-2" /> Get QR Code
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {submissions.map((sub) => (
            <Card key={sub.id} className="overflow-hidden group">
              <div className="aspect-square relative bg-muted">
                <img
                  src={sub.image_url}
                  alt="Guest submission"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-2 right-2">
                  <SubmissionStatusBadge status={sub.status} />
                </div>
                {sub.generated_caption && (
                  <div className="absolute bottom-2 left-2">
                    <Badge className="bg-info/90 text-white text-[10px]">
                      <Sparkles className="w-3 h-3 mr-1" /> AI Enhanced
                    </Badge>
                  </div>
                )}
              </div>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {sub.guest_name || 'Anonymous'} · {format(new Date(sub.created_at), 'dd MMM')}
                  </span>
                </div>
                {sub.generated_caption && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{sub.generated_caption}</p>
                )}
                {sub.suggested_hashtags && sub.suggested_hashtags.length > 0 && (
                  <p className="text-[10px] text-info/80 truncate">{sub.suggested_hashtags.join(' ')}</p>
                )}
                {sub.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => updateStatus.mutate({ id: sub.id, status: 'approved' })}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => updateStatus.mutate({ id: sub.id, status: 'rejected' })}
                      disabled={updateStatus.isPending}
                    >
                      <XCircle className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SubmissionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-500/90 text-white',
    approved: 'bg-success/90 text-white',
    rejected: 'bg-destructive/90 text-white',
    processed: 'bg-info/90 text-white',
  };
  return <Badge className={`text-[10px] ${map[status] || ''}`}>{status}</Badge>;
}
