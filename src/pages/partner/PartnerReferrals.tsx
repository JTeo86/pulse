import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const filters = ['all', 'submitted', 'clicked', 'booking_confirmed', 'verified', 'paid'] as const;

export default function PartnerReferrals() {
  const { referrer } = usePartnerAccess();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<typeof filters[number]>('all');
  const [entryMethod, setEntryMethod] = useState<'direct' | 'link' | 'code'>('direct');
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [bookingDate, setBookingDate] = useState('');
  const [promoCode, setPromoCode] = useState('');

  const { data: links } = useQuery({
    queryKey: ['partner-links-for-submit', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return [];
      const { data, error } = await supabase.from('referral_links').select('id, code').eq('referrer_id', referrer.id).eq('status', 'active').limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!referrer?.id,
  });

  const { data: referrals, isLoading } = useQuery({
    queryKey: ['partner-referrals', referrer?.id],
    queryFn: async () => {
      if (!referrer?.id) return [];
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('partner_id', referrer.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!referrer?.id,
  });

  const submitReferral = useMutation({
    mutationFn: async () => {
      if (!referrer?.id || !referrer?.venue_id) throw new Error('Partner profile is incomplete');
      const payload = {
        p_venue_id: referrer.venue_id,
        p_partner_id: referrer.id,
        p_source_type: entryMethod,
        p_guest_name: guestName || null,
        p_booking_date: bookingDate ? new Date(bookingDate).toISOString() : null,
        p_party_size: Number(partySize) || null,
        p_promo_code: entryMethod === 'code' ? (promoCode || links?.[0]?.code || null) : null,
        p_referral_link_id: entryMethod === 'link' ? links?.[0]?.id ?? null : null,
      };
      const { error } = await supabase.rpc('upsert_referral_entry', payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-referrals'] });
      setGuestName('');
      setBookingDate('');
      setPromoCode('');
      toast.success('Referral submitted');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => (referrals ?? []).filter((r) => (filter === 'all' ? true : r.status === filter)), [referrals, filter]);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Referrals</h1>
        <p className="text-muted-foreground mt-1">Use direct submit, referral links, or promo codes in one unified referral system.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit Referral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Entry Method</Label>
              <Select value={entryMethod} onValueChange={(v: 'direct' | 'link' | 'code') => setEntryMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct entry</SelectItem>
                  <SelectItem value="link">Tracked link</SelectItem>
                  <SelectItem value="code">Promo code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Guest Name</Label>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label>Booking Date</Label>
              <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Party Size</Label>
              <Input value={partySize} onChange={(e) => setPartySize(e.target.value)} inputMode="numeric" />
            </div>
            {entryMethod === 'code' && (
              <div className="space-y-2 md:col-span-2">
                <Label>Promo Code</Label>
                <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder={links?.[0]?.code || 'Enter code'} />
              </div>
            )}
          </div>
          <Button onClick={() => submitReferral.mutate()} disabled={submitReferral.isPending}>Submit referral</Button>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="capitalize">
            {f.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : !filtered.length ? (
        <EmptyState icon={BarChart3} title="No referral activity yet" description="Submit direct referrals or use links/codes to start tracking." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-foreground">{format(new Date(r.booking_date || r.created_at), 'dd MMM yyyy')}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="capitalize text-xs">{r.source_type}</Badge></td>
                      <td className="px-4 py-3 text-foreground">{r.guest_name || '—'}</td>
                      <td className="px-4 py-3"><Badge variant="secondary" className="text-xs capitalize">{r.status}</Badge></td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{r.attribution_confidence}</Badge></td>
                      <td className="px-4 py-3 text-right text-foreground">{r.commission != null ? `£${Number(r.commission).toFixed(2)}` : '—'}</td>
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
