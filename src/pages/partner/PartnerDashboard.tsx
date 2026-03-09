import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MousePointerClick, CalendarCheck, BadgeDollarSign, Wallet, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function PartnerDashboard() {
  const { referrer } = usePartnerAccess();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['partner-dashboard-stats', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return null;

      const [clicksRes, bookingsRes, linksRes] = await Promise.all([
        supabase.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('referrer_id', referrer.id),
        supabase.from('referral_bookings').select('*').eq('referrer_id', referrer.id),
        supabase.from('referral_links').select('id', { count: 'exact', head: true }).eq('referrer_id', referrer.id).eq('status', 'active'),
      ]);

      const bookings = bookingsRes.data ?? [];
      const verifiedSpend = bookings.filter(b => b.spend_verified).reduce((s, b) => s + (Number(b.verified_spend) || 0), 0);
      const estimatedEarnings = bookings.reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);
      const paidEarnings = bookings.filter(b => b.commission_status === 'paid').reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);

      return {
        clicks: clicksRes.count ?? 0,
        bookings: bookings.length,
        verifiedSpend,
        estimatedEarnings,
        paidEarnings,
        activeLinks: linksRes.count ?? 0,
        recentBookings: bookings.slice(0, 5),
      };
    },
    enabled: !!referrer?.id,
  });

  const summaryCards = [
    { label: 'Clicks', value: stats?.clicks ?? 0, icon: MousePointerClick, format: 'number' },
    { label: 'Attributed Bookings', value: stats?.bookings ?? 0, icon: CalendarCheck, format: 'number' },
    { label: 'Verified Spend', value: stats?.verifiedSpend ?? 0, icon: BadgeDollarSign, format: 'currency' },
    { label: 'Estimated Earnings', value: stats?.estimatedEarnings ?? 0, icon: Wallet, format: 'currency' },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {referrer?.full_name ? `Welcome, ${referrer.full_name.split(' ')[0]}` : 'Welcome'}
        </h1>
        <p className="text-muted-foreground mt-1">Track your referrals, earnings, and active venue offers.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{card.label}</span>
                  </div>
                  <p className="text-xl font-semibold text-foreground">
                    {card.format === 'currency' ? `£${card.value.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : card.value}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Links</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">{stats?.activeLinks ?? 0}</p>
            <Link to="/partner/links">
              <Button variant="ghost" size="sm" className="mt-2 px-0 text-accent">
                View links <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paid This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              £{(stats?.paidEarnings ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </p>
            <Link to="/partner/earnings">
              <Button variant="ghost" size="sm" className="mt-2 px-0 text-accent">
                View earnings <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Referral Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : !stats?.recentBookings?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No referral activity yet. Start sharing your links to begin tracking clicks and bookings.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm text-foreground">{b.guest_name || 'Guest'}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(b.created_at), 'dd MMM yyyy')}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={b.spend_verified ? 'default' : 'secondary'} className="text-xs">
                      {b.spend_verified ? 'Verified' : b.booking_status}
                    </Badge>
                    {b.commission_amount && (
                      <p className="text-xs text-muted-foreground mt-1">£{Number(b.commission_amount).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
