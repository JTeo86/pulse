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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Wallet, CheckCircle2, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const [selectedCommissionId, setSelectedCommissionId] = useState<string>('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('other');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [disputeType, setDisputeType] = useState('other');
  const [disputeReason, setDisputeReason] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [excludedCommissionIds, setExcludedCommissionIds] = useState<Record<string, boolean>>({});

  const { data: payoutPeriods } = useQuery({
    queryKey: ['venue-payout-periods', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await (supabase as any)
        .from('payout_periods')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('month', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const activePeriod = payoutPeriods?.[0];
  const reviewWindowEndsLabel = activePeriod?.review_window_ends_at
    ? new Date(activePeriod.review_window_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const { data: periodCommissions } = useQuery({
    queryKey: ['period-commissions', activePeriod?.id],
    queryFn: async () => {
      if (!activePeriod?.id) return [];
      const { data, error } = await (supabase as any)
        .from('commissions')
        .select('id, commission_value, locked_commission_value, status, referrals(guest_name), referrers(full_name)')
        .eq('payout_period_id', activePeriod.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activePeriod?.id,
  });

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

  const { data: payoutAuditEvents } = useQuery({
    queryKey: ['manual-payout-audit-events', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('referral_audit_events')
        .select('created_at, event_payload')
        .eq('venue_id', currentVenue.id)
        .eq('event_type', 'manual_payout_status_updated')
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
        .eq('status', 'final');
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

  const filteredPartnerOptions = partnerOptions.filter((partner) => {
    const needle = partnerSearch.trim().toLowerCase();
    if (!needle) return true;
    return partner.name.toLowerCase().includes(needle);
  });

  const periodRows = (periodCommissions ?? []).slice(0, 8);
  const includedRows = periodRows.filter((c: any) => !excludedCommissionIds[c.id]);
  const excludedRows = periodRows.filter((c: any) => !!excludedCommissionIds[c.id]);
  const includedTotal = includedRows.reduce((sum: number, row: any) => sum + (Number(row.locked_commission_value ?? row.commission_value ?? 0) || 0), 0);
  const excludedTotal = excludedRows.reduce((sum: number, row: any) => sum + (Number(row.locked_commission_value ?? row.commission_value ?? 0) || 0), 0);

  const paidDateByPayoutId = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of payoutAuditEvents ?? []) {
      const payload = (event as any)?.event_payload ?? {};
      if (payload?.status === 'confirmed' && payload?.payout_id && !map.has(payload.payout_id)) {
        map.set(payload.payout_id, event.created_at);
      }
    }
    return map;
  }, [payoutAuditEvents]);

  const createPayout = useMutation({
    mutationFn: async () => {
      if (!currentVenue || !partnerId) throw new Error('Select a partner first.');
      const selected = (payableCommissions ?? []).filter((c) => c.partner_id === partnerId && !excludedCommissionIds[c.id]);
      if (!selected.length) throw new Error('This partner has no finalised commissions.');

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
      if (status === 'confirmed' && activePeriod && !['locked', 'final', 'paid', 'overdue'].includes(activePeriod.status)) {
        throw new Error('Lock the payout period before marking a payout as paid.');
      }
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

  const payablePeriod = (payoutPeriods ?? []).find((period: any) => ['final', 'overdue'].includes(period.status));

  const createAdjustment = useMutation({
    mutationFn: async () => {
      if (!activePeriod?.id || activePeriod.status !== 'review_window') throw new Error('Adjustments are only available during review.');
      if (!selectedCommissionId) throw new Error('Choose a commission first.');
      const amount = Number(adjustmentAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid amount.');
      const selected = (periodCommissions ?? []).find((item: any) => item.id === selectedCommissionId);
      if (!selected) throw new Error('Commission not found.');

      const { error } = await (supabase as any).from('commission_adjustments').insert({
        commission_id: selectedCommissionId,
        payout_period_id: activePeriod.id,
        previous_amount: Number(selected.locked_commission_value ?? selected.commission_value ?? 0),
        new_amount: amount,
        adjustment_type: adjustmentType,
        reason: adjustmentReason || 'Adjusted during review window',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdjustmentAmount('');
      setAdjustmentReason('');
      qc.invalidateQueries({ queryKey: ['period-commissions'] });
      qc.invalidateQueries({ queryKey: ['venue-payout-periods'] });
      toast.success('Commission adjustment logged');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDispute = useMutation({
    mutationFn: async () => {
      if (!activePeriod?.id || activePeriod.status !== 'review_window') throw new Error('Disputes are only available during review.');
      if (!selectedCommissionId) throw new Error('Choose a commission first.');
      if (!disputeReason.trim()) throw new Error('Add a note for this dispute.');
      const { error } = await (supabase as any).from('commission_disputes').insert({
        commission_id: selectedCommissionId,
        payout_period_id: activePeriod.id,
        opened_by: user?.id ?? null,
        dispute_type: disputeType,
        reason: disputeReason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDisputeReason('');
      qc.invalidateQueries({ queryKey: ['period-commissions'] });
      toast.success('Dispute opened');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createStripePayoutIntent = useMutation({
    mutationFn: async () => {
      if (!currentVenue || !payablePeriod) throw new Error('No final payout period ready for payment.');
      const { data, error } = await supabase.functions.invoke('create-monthly-payout-intent', {
        body: {
          venue_id: currentVenue.id,
          payout_period_id: payablePeriod.id,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['venue-payout-periods'] });
      toast.success(`Stripe PaymentIntent created (${data?.payment_intent_id ?? 'pending'})`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <div className="rounded-md border border-border p-3 space-y-2">
            <h3 className="font-semibold text-sm">Monthly Stripe batch payout</h3>
            <p className="text-xs text-muted-foreground">
              Commissions are locked monthly, held for dispute buffer, and paid in a single Stripe Connect batch.
            </p>
            {payablePeriod ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={payablePeriod.status === 'overdue' ? 'destructive' : 'secondary'} className="capitalize">{payablePeriod.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(payablePeriod.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} • £{Number(payablePeriod.total_commission || 0).toFixed(2)}
                </span>
                <Button size="sm" onClick={() => createStripePayoutIntent.mutate()} disabled={createStripePayoutIntent.isPending}>
                  Pay with Stripe
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No final payout period is ready to pay yet.</p>
            )}
          </div>

          {!!activePeriod && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{getPayoutPeriodLabel(activePeriod.status)}</Badge>
                {reviewWindowEndsLabel && <span className="text-xs text-muted-foreground">Review window ends {reviewWindowEndsLabel}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                Items in dispute are excluded from this month until resolved. Unresolved items never block the rest of the batch.
              </p>
            </div>
          )}
          <div>
            <h3 className="font-semibold">Create Payout Batch</h3>
            <p className="text-xs text-muted-foreground mt-1">Pick a partner with finalised commissions, then create a batch you can send manually.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Input value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} placeholder="Search partner" />
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPartnerOptions.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>{partner.name} • £{partner.amount.toFixed(2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} placeholder="Payout method" />
            <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} placeholder="Reference note (optional)" />
            <Button onClick={() => createPayout.mutate()} disabled={!partnerId || createPayout.isPending}>Create Batch</Button>
          </div>
          <div>
            <Button asChild variant="outline" size="sm">
              <Link to="/growth/partners">Quick add partner</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {!!activePeriod && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <h3 className="font-semibold">Monthly review items</h3>
              <p className="text-xs text-muted-foreground mt-1">Use clear statuses to confirm what is included, excluded, or paid.</p>
            </div>
            {!periodRows.length ? (
              <p className="text-xs text-muted-foreground">No monthly review items yet.</p>
            ) : (
              <>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-sm font-medium">Payout review summary</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span><strong>Included:</strong> £{includedTotal.toFixed(2)} ({includedRows.length})</span>
                    <span className="text-amber-600"><strong>Excluded:</strong> £{excludedTotal.toFixed(2)} ({excludedRows.length})</span>
                    <span><strong>Period:</strong> {getPayoutPeriodLabel(activePeriod.status)}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Booking</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Include in payout</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periodRows.map((c: any) => {
                        const excluded = !!excludedCommissionIds[c.id];
                        return (
                          <TableRow key={c.id} className={excluded ? 'bg-amber-500/5' : ''}>
                            <TableCell className="font-medium">{(c.referrals as any)?.guest_name || 'Booking'}</TableCell>
                            <TableCell>{(c.referrers as any)?.full_name || 'Partner'}</TableCell>
                            <TableCell className="text-right">£{Number(c.locked_commission_value ?? c.commission_value ?? 0).toFixed(2)}</TableCell>
                            <TableCell><Badge variant="outline">{excluded ? 'Excluded' : getCommissionLabel(c.status)}</Badge></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={!excluded}
                                  onCheckedChange={(checked) => setExcludedCommissionIds((prev) => ({ ...prev, [c.id]: !checked }))}
                                  disabled={['locked', 'final', 'paid', 'overdue'].includes(activePeriod.status)}
                                />
                                <span className="text-xs text-muted-foreground">{excluded ? 'Excluded' : 'Included'}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            {activePeriod.status === 'review_window' ? (
              <div className="grid md:grid-cols-2 gap-4 rounded-md border border-border p-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Needs adjustment</p>
                  <Select value={selectedCommissionId} onValueChange={setSelectedCommissionId}>
                    <SelectTrigger><SelectValue placeholder="Choose item" /></SelectTrigger>
                    <SelectContent>
                      {(periodCommissions ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {(c.referrals as any)?.guest_name || 'Booking'} • £{Number(c.locked_commission_value ?? c.commission_value ?? 0).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} placeholder="New amount" type="number" />
                  <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bill_corrected">Bill corrected</SelectItem>
                      <SelectItem value="partial_refund">Partial refund</SelectItem>
                      <SelectItem value="full_refund">Full refund</SelectItem>
                      <SelectItem value="duplicate">Duplicate</SelectItem>
                      <SelectItem value="attribution_corrected">Attribution corrected</SelectItem>
                      <SelectItem value="invalid_referral">Invalid referral</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="Reason" />
                  <Button size="sm" onClick={() => createAdjustment.mutate()} disabled={createAdjustment.isPending}>Save adjustment</Button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">In dispute</p>
                  <Select value={disputeType} onValueChange={setDisputeType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="venue_dispute">Venue dispute</SelectItem>
                      <SelectItem value="partner_dispute">Partner dispute</SelectItem>
                      <SelectItem value="attribution_dispute">Attribution dispute</SelectItem>
                      <SelectItem value="booking_validity">Booking validity</SelectItem>
                      <SelectItem value="amount_dispute">Amount dispute</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Add note for dispute" />
                  <Button size="sm" variant="outline" onClick={() => openDispute.mutate()} disabled={openDispute.isPending || !selectedCommissionId}>Raise dispute</Button>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <span>Unresolved disputes are escalated and excluded from this month. Other final items still get paid.</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Adjustments and disputes are only available during the review window.</p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading payouts…</div>
      ) : !payouts?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Wallet}
              title="No payout batches yet"
              description="Finalise commissions, then create your first manual payout batch."
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
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!activePeriod && !['locked', 'final', 'paid', 'overdue'].includes(activePeriod.status)}
                            onClick={() => updatePayout.mutate({ id: p.id, status: 'confirmed', partner: (p.referrers as any)?.full_name || 'Partner' })}
                          >
                            Mark as Paid
                          </Button>
                        )}
                        {p.status === 'confirmed' && (
                          <span className="text-xs text-muted-foreground">
                            Paid {paidDateByPayoutId.get(p.id) ? new Date(paidDateByPayoutId.get(p.id)!).toLocaleDateString() : '—'}
                          </span>
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
  const colorMap: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    sent: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    confirmed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };
  const labelMap: Record<string, string> = {
    pending: 'Open',
    sent: 'Locked',
    confirmed: 'Paid',
  };
  return <Badge variant="outline" className={`text-xs capitalize ${colorMap[status] || ''}`}>{labelMap[status] || status}</Badge>;
}

function getPayoutPeriodLabel(status: string) {
  const labels: Record<string, string> = {
    open: 'Open',
    locked: 'Locked',
    review_window: 'Open',
    final: 'Locked',
    paid: 'Paid',
    overdue: 'Locked',
  };
  return labels[status] ?? status;
}

function getCommissionLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    locked: 'Included',
    adjusted: 'Excluded',
    disputed: 'Excluded',
    final: 'Included',
    paid: 'Paid',
  };
  return labels[status] ?? status;
}
