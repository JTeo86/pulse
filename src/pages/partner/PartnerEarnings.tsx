import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Wallet, Info } from 'lucide-react';

export default function PartnerEarnings() {
  const { referrer } = usePartnerAccess();

  const { data, isLoading } = useQuery({
    queryKey: ['partner-earnings', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return null;
      const { data: bookings, error } = await supabase
        .from('referral_bookings')
        .select('*')
        .eq('referrer_id', referrer.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const all = bookings ?? [];
      const estimated = all.reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);
      const approved = all.filter(b => b.commission_status === 'approved' || b.commission_status === 'paid').reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);
      const paid = all.filter(b => b.commission_status === 'paid').reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);
      const pendingVerification = all.filter(b => !b.spend_verified).length;

      return { estimated, approved, paid, pendingVerification, bookings: all };
    },
    enabled: !!referrer?.id,
  });

  const summaryCards = [
    { label: 'Estimated Earnings', value: data?.estimated ?? 0 },
    { label: 'Approved Earnings', value: data?.approved ?? 0 },
    { label: 'Paid Earnings', value: data?.paid ?? 0 },
    { label: 'Pending Verification', value: data?.pendingVerification ?? 0, isCurrency: false },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Earnings</h1>
        <p className="text-muted-foreground mt-1">Your commission summary and payout history.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                  <p className="text-xl font-semibold text-foreground mt-1">
                    {card.isCurrency === false
                      ? card.value
                      : `£${card.value.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Manual payout notice */}
      <div className="flex items-start gap-3 rounded-lg bg-muted/50 border border-border p-4">
        <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Manual payout mode</p>
          <p className="text-xs text-muted-foreground mt-1">
            Payouts are currently reviewed and processed manually by the venue and platform. Automated payouts will be available soon.
          </p>
        </div>
      </div>

      {/* Earnings breakdown */}
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.bookings?.length ? (
        <EmptyState
          icon={Wallet}
          title="No earnings yet"
          description="Once bookings are verified, your estimated earnings will appear here."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Booking</th>
                    <th className="px-4 py-3 font-medium text-right">Commission</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.filter(b => b.commission_amount).map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground">{b.guest_name || 'Guest'}</td>
                      <td className="px-4 py-3 text-right text-foreground">£{Number(b.commission_amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={b.commission_status === 'paid' ? 'default' : 'secondary'} className="text-xs capitalize">
                          {b.commission_status}
                        </Badge>
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
