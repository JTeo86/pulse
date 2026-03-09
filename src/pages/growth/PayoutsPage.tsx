import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { ReferralGuard, BetaBadge } from '@/components/referral/ReferralGuard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { Wallet, DollarSign, CheckCircle2, Download, CreditCard, Clock } from 'lucide-react';

export default function PayoutsPage() {
  return (
    <ReferralGuard>
      <PayoutsContent />
    </ReferralGuard>
  );
}

function PayoutsContent() {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { flags } = useReferralAccess();
  const qc = useQueryClient();
  const [selectedBatch, setSelectedBatch] = useState<any>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['payout-batches', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('payout_batches')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const { data: batchItems } = useQuery({
    queryKey: ['payout-items', selectedBatch?.id],
    queryFn: async () => {
      if (!selectedBatch) return [];
      const { data, error } = await supabase
        .from('payout_items')
        .select('*, referrers(full_name)')
        .eq('batch_id', selectedBatch.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedBatch,
  });

  const stats = {
    pending: batches?.filter((b: any) => ['draft', 'pending_approval'].includes(b.status)).length ?? 0,
    approved: batches?.filter((b: any) => b.status === 'approved').length ?? 0,
    totalOwed: batches?.filter((b: any) => !['paid', 'failed'].includes(b.status)).reduce((sum: number, b: any) => sum + (b.net_payout || 0), 0) ?? 0,
  };

  const updateBatch = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === 'approved') updates.approved_at = new Date().toISOString();
      if (status === 'paid') updates.paid_at = new Date().toISOString();
      const { error } = await supabase.from('payout_batches').update(updates).eq('id', id);
      if (error) throw error;
      await supabase.from('referral_audit_events').insert({
        venue_id: currentVenue!.id,
        actor_user_id: user?.id,
        event_type: status === 'approved' ? 'payout_batch_approved' : 'payout_paid',
        event_payload: { batch_id: id, status },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payout-batches'] });
      toast.success('Batch updated');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <PageHeader title="Payouts" description="Review and approve partner payouts based on verified bookings." />
        <BetaBadge />
      </div>

      {/* Stripe Mode Banner */}
      {!flags.stripeEnabled && (
        <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-500">Manual Payout Mode</p>
            <p className="text-xs text-muted-foreground">
              Stripe Connect is not configured. Payout batches are prepared in Pulse and processed manually.
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><Clock className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{stats.pending}</p><p className="text-xs text-muted-foreground mt-1">Pending Batches</p></CardContent></Card>
        <Card><CardContent className="p-4"><CheckCircle2 className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{stats.approved}</p><p className="text-xs text-muted-foreground mt-1">Approved This Month</p></CardContent></Card>
        <Card><CardContent className="p-4"><DollarSign className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">£{stats.totalOwed.toFixed(0)}</p><p className="text-xs text-muted-foreground mt-1">Total Commission Owed</p></CardContent></Card>
        <Card><CardContent className="p-4"><Wallet className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold text-muted-foreground">{flags.stripeEnabled ? 'Stripe' : 'Manual'}</p><p className="text-xs text-muted-foreground mt-1">Payout Method</p></CardContent></Card>
      </div>

      {/* Batches */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading payouts…</div>
      ) : !batches?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Wallet}
              title="No payout batches yet"
              description="Verified commissions will be grouped into payout batches automatically."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Commission</TableHead>
                  <TableHead>Pulse Fee</TableHead>
                  <TableHead>Net Payout</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b: any) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBatch(b)}>
                    <TableCell className="font-medium">{b.batch_month}</TableCell>
                    <TableCell><PayoutStatusBadge status={b.status} /></TableCell>
                    <TableCell>£{(b.total_commission || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">£{(b.pulse_fee || 0).toFixed(2)}</TableCell>
                    <TableCell className="font-medium">£{(b.net_payout || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {b.status === 'pending_approval' && (
                          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => updateBatch.mutate({ id: b.id, status: 'approved' })}>
                            <CheckCircle2 className="w-3 h-3" />Approve
                          </Button>
                        )}
                        {b.status === 'approved' && !flags.stripeEnabled && (
                          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => updateBatch.mutate({ id: b.id, status: 'paid' })}>
                            <DollarSign className="w-3 h-3" />Mark Paid
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-xs gap-1">
                          <Download className="w-3 h-3" />CSV
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Batch Detail Sheet */}
      <Sheet open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedBatch && (
            <>
              <SheetHeader>
                <SheetTitle>Payout Batch — {selectedBatch.batch_month}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30 border">
                  <div><p className="text-[10px] text-muted-foreground uppercase">Total Commission</p><p className="text-lg font-bold">£{(selectedBatch.total_commission || 0).toFixed(2)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Pulse Fee</p><p className="text-lg font-bold text-muted-foreground">£{(selectedBatch.pulse_fee || 0).toFixed(2)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Net Payout</p><p className="text-lg font-bold text-accent">£{(selectedBatch.net_payout || 0).toFixed(2)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Status</p><PayoutStatusBadge status={selectedBatch.status} /></div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">Payout Items</h4>
                  {!batchItems?.length ? (
                    <p className="text-sm text-muted-foreground">No items in this batch.</p>
                  ) : (
                    <div className="space-y-2">
                      {batchItems.map((item: any) => (
                        <div key={item.id} className="p-3 rounded-lg border flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{(item.referrers as any)?.full_name || 'Partner'}</p>
                            <p className="text-xs text-muted-foreground">Commission: £{item.commission_amount} • Fee: £{item.pulse_fee}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">£{item.net_amount}</p>
                            <PayoutStatusBadge status={item.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    pending_approval: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    approved: 'bg-accent/10 text-accent border-accent/20',
    paid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    failed: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  return <Badge variant="outline" className={`text-xs ${map[status] || ''}`}>{status.replace('_', ' ')}</Badge>;
}
