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
      const { data: commissions, error } = await supabase
        .from('commissions')
        .select('*, referrals(guest_name, booking_date)')
        .eq('partner_id', referrer.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const all = commissions ?? [];
      const pending = all.filter(c => ['pending', 'approved'].includes(c.status)).reduce((s, c) => s + (Number(c.commission_value) || 0), 0);
      const payable = all.filter(c => c.status === 'payable').reduce((s, c) => s + (Number(c.commission_value) || 0), 0);
      const paid = all.filter(c => c.status === 'paid').reduce((s, c) => s + (Number(c.commission_value) || 0), 0);

      return { pending, payable, paid, commissions: all };
    },
    enabled: !!referrer?.id,
  });

  const summaryCards = [
    { label: 'Pending', value: data?.pending ?? 0 },
    { label: 'Payable', value: data?.payable ?? 0 },
    { label: 'Paid', value: data?.paid ?? 0 },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Your Earnings</h1>
        <p className="text-muted-foreground mt-1">Track each referral earning from review to payout confirmation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                  <p className="text-xl font-semibold text-foreground mt-1">
                    £{card.value.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-muted/50 border border-border p-4">
        <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Manual payouts for now</p>
          <p className="text-xs text-muted-foreground mt-1">
            Venues send payouts manually in v1. You can always see if an earning is pending review, payable, or already paid.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.commissions?.length ? (
        <EmptyState
          icon={Wallet}
          title="No earnings yet"
          description="Once a referral is verified, the commission will show up here automatically."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per Booking Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Booking</th>
                    <th className="px-4 py-3 font-medium text-right">Bill</th>
                    <th className="px-4 py-3 font-medium text-right">Commission</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissions.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground">{(c.referrals as any)?.guest_name || 'Guest booking'}</td>
                      <td className="px-4 py-3 text-right text-foreground">£{Number(c.bill_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-foreground">£{Number(c.commission_value || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.status === 'paid' ? 'default' : 'secondary'} className="text-xs capitalize">
                          {c.status}
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
