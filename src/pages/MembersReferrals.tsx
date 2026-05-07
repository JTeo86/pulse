import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Handshake, Users, Wallet, Gift, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ReferralGuard } from '@/components/referral/ReferralGuard';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';

type ReferralRow = {
  id: string;
  partner_id: string | null;
  guest_name: string | null;
  status: string;
  bill_amount: number | null;
  commission: number | null;
  created_at: string;
  referrers?: { full_name: string | null } | null;
};

type CommissionRow = {
  id: string;
  partner_id: string | null;
  commission_value: number | null;
  status: string;
  referrers?: { full_name: string | null } | null;
};

type OfferRow = {
  id: string;
  title: string;
  status: string;
  commission_type: string;
  commission_value: number;
};

export default function MembersReferralsPage() {
  return (
    <ReferralGuard minimumStage={1}>
      <MembersReferralsContent />
    </ReferralGuard>
  );
}

function MembersReferralsContent() {
  const { currentVenue } = useVenue();

  const { data, isLoading } = useQuery({
    queryKey: ['members-referrals-home', currentVenue?.id],
    enabled: !!currentVenue?.id,
    queryFn: async () => {
      if (!currentVenue) return null;

      const [referralsRes, commissionsRes, offersRes, payoutPeriodsRes, walletsRes] = await Promise.all([
        supabase
          .from('referrals')
          .select('id, partner_id, guest_name, status, bill_amount, commission, created_at, referrers(full_name)')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('commissions')
          .select('id, partner_id, commission_value, status, referrers(full_name)')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('venue_offers')
          .select('id, title, status, commission_type, commission_value')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payout_periods')
          .select('id, month, status, total_partner_payout, total_commission')
          .eq('venue_id', currentVenue.id)
          .order('month', { ascending: false })
          .limit(12),
        supabase
          .from('credit_wallets')
          .select('id', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id),
      ]);

      return {
        referrals: (referralsRes.data ?? []) as ReferralRow[],
        commissions: (commissionsRes.data ?? []) as CommissionRow[],
        offers: (offersRes.data ?? []) as OfferRow[],
        payoutPeriods: payoutPeriodsRes.data ?? [],
        walletCount: walletsRes.count ?? 0,
      };
    },
  });

  const summary = useMemo(() => {
    const referrals = data?.referrals ?? [];
    const commissions = data?.commissions ?? [];
    const offers = data?.offers ?? [];
    const payoutPeriods = data?.payoutPeriods ?? [];

    const incomingReferrals = referrals.filter((item) => ['created', 'submitted', 'clicked', 'booking_confirmed'].includes(item.status)).length;
    const bookingsNeedingVerification = referrals.filter((item) => ['visited', 'bill_entered'].includes(item.status)).length;
    const commissionsOwed = commissions
      .filter((item) => !['paid'].includes(item.status))
      .reduce((sum, item) => sum + (Number(item.commission_value) || 0), 0);
    const activeOffers = offers.filter((item) => item.status === 'active').length;
    const latestPayout = payoutPeriods[0] ?? null;

    const topPartners = Array.from(
      referrals.reduce((map, item) => {
        const key = item.partner_id || `unknown-${item.id}`;
        const current = map.get(key) ?? {
          id: key,
          name: item.referrers?.full_name || 'Partner',
          referrals: 0,
          revenue: 0,
        };
        current.referrals += 1;
        current.revenue += Number(item.bill_amount) || 0;
        map.set(key, current);
        return map;
      }, new Map<string, { id: string; name: string; referrals: number; revenue: number }>()),
    )
      .map(([, value]) => value)
      .sort((a, b) => b.referrals - a.referrals)
      .slice(0, 5);

    return {
      incomingReferrals,
      bookingsNeedingVerification,
      commissionsOwed,
      activeOffers,
      latestPayout,
      topPartners,
      membershipState: (data?.walletCount ?? 0) > 0
        ? `${data?.walletCount ?? 0} wallet placeholder${(data?.walletCount ?? 0) === 1 ? '' : 's'} configured`
        : 'Membership foundation not configured yet',
    };
  }, [data]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader
        title="Members & Referrals"
        description="Track promoters, referrals, verified spend, commissions, and the early membership foundation from one commercial operating surface."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Incoming Referrals" value={isLoading ? '—' : String(summary.incomingReferrals)} detail="New partner demand in flight" icon={Handshake} />
        <SummaryCard label="Need Verification" value={isLoading ? '—' : String(summary.bookingsNeedingVerification)} detail="Bookings waiting on bill checks" icon={Wallet} />
        <SummaryCard label="Commissions Owed" value={isLoading ? '—' : `£${summary.commissionsOwed.toFixed(0)}`} detail="Unpaid partner commission total" icon={Gift} />
        <SummaryCard label="Membership" value={isLoading ? '—' : summary.membershipState} detail="Simple loyalty foundation status" icon={Users} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">Referral Activity</CardTitle>
              <p className="text-sm text-muted-foreground">Venue-side referrals, verification blockers, and partner performance.</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/venue/referrals">
                Open pipeline
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.topPartners.length ? (
              summary.topPartners.map((partner) => (
                <div key={partner.id} className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{partner.name}</p>
                      <p className="text-xs text-muted-foreground">{partner.referrals} referral{partner.referrals === 1 ? '' : 's'} tracked</p>
                    </div>
                    <Badge variant="outline">£{partner.revenue.toFixed(0)} revenue</Badge>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Handshake}
                title="No referral activity yet"
                description="Partner performance and booking verification will appear here as referrals start moving through the pipeline."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">Offers & Payouts</CardTitle>
              <p className="text-sm text-muted-foreground">Reward structure and month-end payout readiness.</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/growth/payouts">
                Open payouts
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active offers</p>
              <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : summary.activeOffers}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest payout period</p>
              <p className="mt-2 text-sm font-medium">
                {summary.latestPayout
                  ? `${new Date(summary.latestPayout.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · ${summary.latestPayout.status}`
                  : 'No payout period yet'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/growth/offers">Manage offers</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/venue/referrals">Manual venue view</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Membership Foundation</CardTitle>
          <p className="text-sm text-muted-foreground">Member profiles, tiers, rewards, visits, and spend tracking are not yet fully implemented in the venue app.</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Pulse now has a clear place for loyalty and membership to live, but the current codebase only exposes referral, payout, and wallet-placeholder infrastructure. The next implementation step should add simple member profiles, tier status, reward usage, and referral history without turning this into a heavy CRM.
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Handshake;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
