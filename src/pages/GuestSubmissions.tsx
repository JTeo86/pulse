import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Camera, CheckCircle2, XCircle, Image, ExternalLink, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function GuestSubmissions() {
  const { currentVenue } = useVenue();
  const qc = useQueryClient();

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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-submissions'] });
      toast.success('Submission updated');
    },
    onError: (e) => toast.error(e.message),
  });

  const pending = submissions?.filter(s => s.status === 'pending') ?? [];
  const approved = submissions?.filter(s => s.status === 'approved') ?? [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Guest Photos"
        description="Review and approve guest-submitted photos for your content library."
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{pending.length} pending</Badge>
          </div>
        }
      />

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
          description="Share your guest upload link to start receiving photos from your guests."
          action={
            <Button variant="outline" onClick={() => {
              const url = `${window.location.origin}/submit/${currentVenue?.id}`;
              navigator.clipboard.writeText(url);
              toast.success('Guest upload link copied!');
            }}>
              Copy Guest Upload Link
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
              </div>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {sub.guest_name || 'Anonymous'} · {format(new Date(sub.created_at), 'dd MMM')}
                  </span>
                </div>
                {sub.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => updateStatus.mutate({ id: sub.id, status: 'approved' })}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => updateStatus.mutate({ id: sub.id, status: 'rejected' })}
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
