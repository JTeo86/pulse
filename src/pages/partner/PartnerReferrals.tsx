import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const filters = ['all', 'pending', 'verified', 'paid'] as const;

const statusBadge = (booking: any) => {
  if (booking.commission_status === 'paid') return <Badge className="bg-success/10 text-success text-xs">Paid</Badge>;
  if (booking.spend_verified) return <Badge className="bg-info/10 text-info text-xs">Verified</Badge>;
  return <Badge variant="secondary" className="text-xs">Pending verification</Badge>;
};

export default function PartnerReferrals() {
  const { referrer } = usePartnerAccess();
  const [filter, setFilter] = useState<typeof filters[number]>('all');

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['partner-referrals', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return [];
      const { data, error } = await supabase
        .from('referral_bookings')
        .select('*, venue_offers(title)')
        .eq('referrer_id', referrer.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!referrer?.id,
  });

  const filtered = (bookings ?? []).filter((b) => {
    if (filter === 'pending') return !b.spend_verified;
    if (filter === 'verified') return b.spend_verified && b.commission_status !== 'paid';
    if (filter === 'paid') return b.commission_status === 'paid';
    return true;
  });

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Referrals</h1>
        <p className="text-muted-foreground mt-1">Track your referral activity, bookings, and commission status.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : !filtered.length ? (
        <EmptyState
          icon={BarChart3}
          title="No referral activity yet"
          description="Start sharing your links to begin tracking clicks and bookings."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Offer</th>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Verified Spend</th>
                    <th className="px-4 py-3 font-medium text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-foreground">{format(new Date(b.created_at), 'dd MMM yyyy')}</td>
                      <td className="px-4 py-3 text-foreground">{(b.venue_offers as any)?.title || '—'}</td>
                      <td className="px-4 py-3 text-foreground">{b.guest_name || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(b)}</td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {b.spend_verified ? `£${Number(b.verified_spend).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {b.commission_amount ? `£${Number(b.commission_amount).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
