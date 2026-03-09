import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Receipt, Wallet, DollarSign, TrendingUp, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReferralHomeCards() {
  const { currentVenue } = useVenue();
  const { venueHasAccess } = useReferralAccess();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['referral-home-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [pendingVerify, pendingPayout, activePartners, bookingsRes, guestUgc] = await Promise.all([
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('spend_verified', false).in('booking_status', ['attended', 'confirmed']),
        supabase.from('payout_batches').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'pending_approval'),
        supabase.from('referrers').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'active'),
        supabase.from('referral_bookings').select('verified_spend, commission_amount, spend_verified')
          .eq('venue_id', currentVenue.id).eq('spend_verified', true),
        supabase.from('guest_submissions').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'pending'),
      ]);

      const bookings = bookingsRes.data ?? [];
      const totalRevenue = bookings.reduce((s, b) => s + (Number(b.verified_spend) || 0), 0);
      const totalCommission = bookings.reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);

      return {
        pendingVerify: pendingVerify.count ?? 0,
        pendingPayout: pendingPayout.count ?? 0,
        activePartners: activePartners.count ?? 0,
        totalRevenue,
        totalCommission,
        pendingUGC: guestUgc.count ?? 0,
      };
    },
    enabled: !!currentVenue && venueHasAccess,
  });

  if (!venueHasAccess) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Referral Network</h2>
        <Link to="/growth/referrals">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View All <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ReferralStatCard
            icon={TrendingUp}
            label="Referral Revenue"
            value={`£${(stats?.totalRevenue ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`}
            href="/growth/referrals"
          />
          <ReferralStatCard
            icon={Users}
            label="Active Partners"
            value={String(stats?.activePartners ?? 0)}
            href="/growth/partners"
          />
          <ReferralStatCard
            icon={Receipt}
            label="Pending Verifications"
            value={String(stats?.pendingVerify ?? 0)}
            href="/growth/referrals"
            warn={!!stats?.pendingVerify}
          />
          <ReferralStatCard
            icon={Wallet}
            label="Pending Payouts"
            value={String(stats?.pendingPayout ?? 0)}
            href="/growth/payouts"
            warn={!!stats?.pendingPayout}
          />
        </div>
      )}

      {/* Guest UGC card */}
      {stats?.pendingUGC ? (
        <Link to="/venue/guest-photos">
          <Card className="border-accent/20 hover:border-accent/40 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <Camera className="w-5 h-5 text-accent" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{stats.pendingUGC} guest photo{stats.pendingUGC > 1 ? 's' : ''} to review</p>
                <p className="text-xs text-muted-foreground">Guest submissions waiting for approval</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ) : null}
    </section>
  );
}

function ReferralStatCard({ icon: Icon, label, value, href, warn }: {
  icon: any; label: string; value: string; href: string; warn?: boolean;
}) {
  return (
    <Link to={href}>
      <Card className={`group hover:border-accent/50 transition-colors cursor-pointer ${
        warn ? 'border-amber-500/30 bg-amber-500/5' : ''
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Icon className={`w-5 h-5 ${warn ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
