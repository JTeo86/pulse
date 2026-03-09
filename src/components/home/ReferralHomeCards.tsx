import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Receipt, Wallet, DollarSign } from 'lucide-react';

export function ReferralHomeCards() {
  const { currentVenue } = useVenue();
  const { venueHasAccess } = useReferralAccess();

  const { data: stats } = useQuery({
    queryKey: ['referral-home-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [pendingVerify, pendingPayout, activePartners] = await Promise.all([
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('spend_verified', false).in('booking_status', ['attended', 'confirmed']),
        supabase.from('payout_batches').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'pending_approval'),
        supabase.from('referrers').select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id).eq('status', 'active'),
      ]);
      return {
        pendingVerify: pendingVerify.count ?? 0,
        pendingPayout: pendingPayout.count ?? 0,
        activePartners: activePartners.count ?? 0,
      };
    },
    enabled: !!currentVenue && venueHasAccess,
  });

  if (!venueHasAccess || !stats) return null;

  const cards = [
    { label: 'Active Partners', value: stats.activePartners, icon: Users, href: '/growth/partners' },
    { label: 'Pending Verifications', value: stats.pendingVerify, icon: Receipt, href: '/growth/referrals', warn: stats.pendingVerify > 0 },
    { label: 'Pending Payouts', value: stats.pendingPayout, icon: Wallet, href: '/growth/payouts', warn: stats.pendingPayout > 0 },
  ].filter(c => c.value > 0 || c.label === 'Active Partners');

  if (cards.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Referral Network</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, href, warn }) => (
          <Link key={label} to={href}>
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
        ))}
      </div>
    </section>
  );
}
