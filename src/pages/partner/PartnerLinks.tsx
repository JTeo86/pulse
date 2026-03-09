import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link2, Copy, Check, QrCode, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

export default function PartnerLinks() {
  const { referrer } = usePartnerAccess();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: links, isLoading } = useQuery({
    queryKey: ['partner-links', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return [];
      const { data, error } = await supabase
        .from('referral_links')
        .select('*, venue_offers(title, commission_type, commission_value)')
        .eq('referrer_id', referrer.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!referrer?.id,
  });

  const copyLink = (link: any) => {
    const url = link.destination_url || `${window.location.origin}/r/${link.code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    toast.success('Link copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Your Links</h1>
        <p className="text-muted-foreground mt-1">Share your links online or use QR codes for in-person referrals.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4">{[1, 2].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : !links?.length ? (
        <EmptyState
          icon={Link2}
          title="No referral links available yet"
          description="Links will appear once you are assigned to an offer."
        />
      ) : (
        <div className="grid gap-4">
          {links.map((link) => {
            const offer = link.venue_offers as any;
            const url = link.destination_url || `${window.location.origin}/r/${link.code}`;
            return (
              <Card key={link.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-foreground">{offer?.title || 'Offer'}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {offer?.commission_type === 'percentage'
                          ? `${offer.commission_value}% per verified booking`
                          : offer ? `£${Number(offer.commission_value).toFixed(2)} per booking` : ''}
                      </p>

                      <div className="mt-3 flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded text-foreground truncate max-w-xs block">
                          {url}
                        </code>
                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => copyLink(link)}>
                          {copiedId === link.id ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    {link.qr_code_url && (
                      <div className="shrink-0 text-center">
                        <img src={link.qr_code_url} alt="QR Code" className="w-20 h-20 rounded border border-border" />
                        <a href={link.qr_code_url} download className="inline-flex items-center gap-1 text-xs text-accent mt-1">
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                    )}

                    {!link.qr_code_url && (
                      <div className="shrink-0 w-20 h-20 rounded border border-border flex items-center justify-center bg-muted">
                        <QrCode className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">
                    Use your QR code for concierge desks, printed cards, or in-person referrals.
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
