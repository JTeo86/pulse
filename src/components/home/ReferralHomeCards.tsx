import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Receipt, Wallet, TrendingUp, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReferralHomeCards() {
  const { currentVenue } = useVenue();
  const { hasAccess, stage } = useReferralAccess();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['referral-home-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [pendingVerify, pendingPayout, activePartners, bookingsRes] = await Promise.all([
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('spend_verified', false).in('booking_status', ['attended', 'confirmed']),
        supabase.from('payout_batches').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'pending_approval'),
        supabase.from('referrers').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'active'),
        supabase.from('referral_bookings').select('verified_spend')
          .eq('venue_id', currentVenue.id).eq('spend_verified', true),
      ]);

      const bookings = bookingsRes.data ?? [];
      const totalRevenue = bookings.reduce((sum, booking) => sum + (Number(booking.verified_spend) || 0), 0);

      return {
        pendingVerify: pendingVerify.count ?? 0,
        pendingPayout: pendingPayout.count ?? 0,
        activePartners: activePartners.count ?? 0,
        totalRevenue,
      };
    },
    enabled: !!currentVenue && hasAccess,
  });

  if (!hasAccess) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Grow your bookings</h2>
        <Link to="/growth/referrals">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View referral activity <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ReferralStatCard
            icon={TrendingUp}
            label="Referral Revenue"
            value={`£${(stats?.totalRevenue ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`}
            href="/growth/referrals"
          />
          {stage >= 2 ? (
            <ReferralStatCard
              icon={Users}
              label="Reward Partners"
              value={String(stats?.activePartners ?? 0)}
              href="/growth/partners"
            />
          ) : (
            <ReferralStatCard
              icon={Receipt}
              label="Pending Verifications"
              value={String(stats?.pendingVerify ?? 0)}
              href="/growth/referrals"
              warn={!!stats?.pendingVerify}
            />
          )}
          <ReferralStatCard
            icon={Wallet}
            label="Pending Payouts"
            value={String(stats?.pendingPayout ?? 0)}
            href="/growth/payouts"
            warn={!!stats?.pendingPayout}
          />
          {stage >= 3 ? (
            <ReferralStatCard
              icon={Compass}
              label="Discover Venues"
              value="Explore"
              href="/growth/marketplace"
            />
          ) : (
            <ReferralStatCard
              icon={Receipt}
              label="Open Referrals"
              value={String(stats?.pendingVerify ?? 0)}
              href="/growth/referrals"
            />
          )}
        </div>
      )}
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
