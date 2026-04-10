import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { ReferralGuard } from '@/components/referral/ReferralGuard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { Wallet, CheckCircle2, DollarSign, Clock } from 'lucide-react';

export default function PayoutsPage() {
  return (
    <ReferralGuard minimumStage={1}>
      <PayoutsContent />
    </ReferralGuard>
  );
}

function PayoutsContent() {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string>('');
  const [payoutMethod, setPayoutMethod] = useState('Bank transfer');
  const [referenceNote, setReferenceNote] = useState('');

  const { data: payouts, isLoading } = useQuery({
    queryKey: ['manual-payouts', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('payouts')
        .select('*, referrers(full_name)')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const { data: payableCommissions } = useQuery({
    queryKey: ['payable-commissions', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('commissions')
        .select('id, partner_id, commission_value, referrers(full_name)')
        .eq('venue_id', currentVenue.id)
        .eq('status', 'payable');
      if (error) throw error;

      const commissionIds = (data ?? []).map((item) => item.id);
      if (!commissionIds.length) return data ?? [];

      const { data: assigned, error: assignedError } = await supabase
        .from('payout_commissions')
        .select('commission_id')
        .in('commission_id', commissionIds);
      if (assignedError) throw assignedError;

      const assignedIds = new Set((assigned ?? []).map((row) => row.commission_id));
      return (data ?? []).filter((item) => !assignedIds.has(item.id));
    },
    enabled: !!currentVenue,
  });

  const partnerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; amount: number }>();
    for (const commission of payableCommissions ?? []) {
      const entry = map.get(commission.partner_id) ?? {
        id: commission.partner_id,
        name: (commission.referrers as any)?.full_name || 'Partner',
        amount: 0,
      };
      entry.amount += Number(commission.commission_value) || 0;
      map.set(commission.partner_id, entry);
    }
    return Array.from(map.values());
  }, [payableCommissions]);

  const createPayout = useMutation({
    mutationFn: async () => {
      if (!currentVenue || !partnerId) throw new Error('Select a partner first.');
      const selected = (payableCommissions ?? []).filter((c) => c.partner_id === partnerId);
      if (!selected.length) throw new Error('This partner has no payable commissions.');

      const totalAmount = selected.reduce((sum, c) => sum + (Number(c.commission_value) || 0), 0);
      const { data: payout, error } = await supabase
        .from('payouts')
        .insert({
          venue_id: currentVenue.id,
          partner_id: partnerId,
          total_amount: totalAmount,
          payout_method: payoutMethod,
          reference_note: referenceNote || null,
          status: 'pending',
        })
        .select('id')
        .single();
      if (error) throw error;

      const joinRows = selected.map((commission) => ({ payout_id: payout.id, commission_id: commission.id }));
      const { error: joinError } = await supabase.from('payout_commissions').insert(joinRows);
      if (joinError) throw joinError;

      await supabase.from('referral_audit_events').insert({
        venue_id: currentVenue.id,
        actor_user_id: user?.id,
        event_type: 'manual_payout_created',
        event_payload: { payout_id: payout.id, partner_id: partnerId, commission_count: selected.length },
      } as any);
    },
    onSuccess: () => {
      setReferenceNote('');
      qc.invalidateQueries({ queryKey: ['manual-payouts'] });
      qc.invalidateQueries({ queryKey: ['payable-commissions'] });
      toast.success('Payout batch created and commissions assigned');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePayout = useMutation({
    mutationFn: async ({ id, status, partner }: { id: string; status: 'sent' | 'confirmed'; partner: string }) => {
      const { error } = await supabase.from('payouts').update({ status }).eq('id', id);
      if (error) throw error;

      if (status === 'confirmed') {
        const { data: links, error: linkError } = await supabase.from('payout_commissions').select('commission_id').eq('payout_id', id);
        if (linkError) throw linkError;

        const commissionIds = (links ?? []).map((row) => row.commission_id);
        if (commissionIds.length) {
          const { error: commissionError } = await supabase.from('commissions').update({ status: 'paid' }).in('id', commissionIds);
          if (commissionError) throw commissionError;
        }
      }

      await supabase.from('referral_audit_events').insert({
        venue_id: currentVenue!.id,
        actor_user_id: user?.id,
        event_type: 'manual_payout_status_updated',
        event_payload: { payout_id: id, status, partner },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manual-payouts'] });
      qc.invalidateQueries({ queryKey: ['payable-commissions'] });
      qc.invalidateQueries({ queryKey: ['venue-commissions'] });
      toast.success('Payout updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = {
    pending: payouts?.filter((p) => p.status === 'pending').length ?? 0,
    sent: payouts?.filter((p) => p.status === 'sent').length ?? 0,
    total: payouts?.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0) ?? 0,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="Payouts" description="Create manual payout batches, send them off-platform, and confirm when money lands." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><Clock className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{stats.pending}</p><p className="text-xs text-muted-foreground mt-1">Pending Payouts</p></CardContent></Card>
        <Card><CardContent className="p-4"><CheckCircle2 className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{stats.sent}</p><p className="text-xs text-muted-foreground mt-1">Sent, Awaiting Confirmation</p></CardContent></Card>
        <Card><CardContent className="p-4"><DollarSign className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">£{stats.total.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Total Payout Amount</p></CardContent></Card>
        <Card><CardContent className="p-4"><Wallet className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold text-muted-foreground">Manual</p><p className="text-xs text-muted-foreground mt-1">Payout Method</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="font-semibold">Create Payout Batch</h3>
            <p className="text-xs text-muted-foreground mt-1">Pick a partner with payable commissions, then create a batch you can send manually.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select partner" />
              </SelectTrigger>
              <SelectContent>
                {partnerOptions.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>{partner.name} • £{partner.amount.toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} placeholder="Payout method" />
            <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} placeholder="Reference note (optional)" />
            <Button onClick={() => createPayout.mutate()} disabled={!partnerId || createPayout.isPending}>Create Batch</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading payouts…</div>
      ) : !payouts?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Wallet}
              title="No payout batches yet"
              description="Mark commissions as payable, then create your first manual payout batch."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{(p.referrers as any)?.full_name || 'Partner'}</TableCell>
                    <TableCell>£{Number(p.total_amount || 0).toFixed(2)}</TableCell>
                    <TableCell>{p.payout_method || '—'}</TableCell>
                    <TableCell>{p.reference_note || '—'}</TableCell>
                    <TableCell><PayoutStatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {p.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => updatePayout.mutate({ id: p.id, status: 'sent', partner: (p.referrers as any)?.full_name || 'Partner' })}>Mark Sent</Button>
                        )}
                        {p.status === 'sent' && (
                          <Button size="sm" variant="outline" onClick={() => updatePayout.mutate({ id: p.id, status: 'confirmed', partner: (p.referrers as any)?.full_name || 'Partner' })}>Mark Confirmed</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    sent: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    confirmed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };
  return <Badge variant="outline" className={`text-xs capitalize ${map[status] || ''}`}>{status}</Badge>;
}
