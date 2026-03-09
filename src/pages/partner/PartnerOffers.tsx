import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Gift, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function PartnerOffers() {
  const { referrer } = usePartnerAccess();

  const { data: offers, isLoading } = useQuery({
    queryKey: ['partner-offers', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return [];
      // Get offers via referral_links assigned to this referrer
      const { data: links, error } = await supabase
        .from('referral_links')
        .select('offer_id, venue_id')
        .eq('referrer_id', referrer.id)
        .eq('status', 'active');
      if (error) throw error;
      if (!links?.length) return [];

      const offerIds = [...new Set(links.map(l => l.offer_id))];
      const { data: offerData, error: offErr } = await supabase
        .from('venue_offers')
        .select('*')
        .in('id', offerIds)
        .eq('status', 'active');
      if (offErr) throw offErr;
      return offerData ?? [];
    },
    enabled: !!referrer?.id,
  });

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Offers</h1>
        <p className="text-muted-foreground mt-1">Active campaigns you are part of.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4">{[1, 2].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : !offers?.length ? (
        <EmptyState
          icon={Gift}
          title="No active offers yet"
          description="Once a venue invites you to a campaign, it will appear here."
        />
      ) : (
        <div className="grid gap-4">
          {offers.map((offer) => (
            <Card key={offer.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-medium text-foreground">{offer.title}</h3>
                    {offer.description && (
                      <p className="text-sm text-muted-foreground">{offer.description}</p>
                    )}
                  </div>
                  <Badge className="bg-success/10 text-success border-success/25 text-xs shrink-0">Active</Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">What you earn</span>
                    <span className="text-foreground font-medium">
                      {offer.commission_type === 'percentage'
                        ? `${offer.commission_value}% of verified spend`
                        : `£${Number(offer.commission_value).toFixed(2)} per booking`}
                    </span>
                  </div>
                  {offer.start_date && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Active from</span>
                      <span className="text-foreground">{format(new Date(offer.start_date), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                  {offer.end_date && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Until</span>
                      <span className="text-foreground">{format(new Date(offer.end_date), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <Link to="/partner/links">
                    <Button variant="outline" size="sm">
                      Get Link <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
