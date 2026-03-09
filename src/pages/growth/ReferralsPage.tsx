import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { ReferralGuard, BetaBadge } from '@/components/referral/ReferralGuard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import {
  Link2, MousePointerClick, CalendarCheck, DollarSign,
  CheckCircle2, Clock, Search, Upload, Receipt, XCircle, ShieldCheck
} from 'lucide-react';

export default function ReferralsPage() {
  return (
    <ReferralGuard>
      <ReferralsContent />
    </ReferralGuard>
  );
}

function ReferralsContent() {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [verifying, setVerifying] = useState<any>(null);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['referral-bookings', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('referral_bookings')
        .select('*, referrers(full_name, email)')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const { data: stats } = useQuery({
    queryKey: ['referral-overview-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [clicks, total, pendingVerify, pendingCommission] = await Promise.all([
        supabase.from('referral_clicks').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id),
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id),
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('spend_verified', false).in('booking_status', ['attended', 'confirmed']),
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('commission_status', 'pending').eq('spend_verified', true),
      ]);
      return {
        clicks: clicks.count ?? 0,
        bookings: total.count ?? 0,
        pendingVerify: pendingVerify.count ?? 0,
        pendingCommission: pendingCommission.count ?? 0,
      };
    },
    enabled: !!currentVenue,
  });

  // Audit events for verification panel
  const { data: auditEvents } = useQuery({
    queryKey: ['referral-audit', verifying?.id],
    queryFn: async () => {
      if (!verifying) return [];
      const { data } = await supabase
        .from('referral_audit_events')
        .select('*')
        .eq('venue_id', verifying.venue_id)
        .contains('event_payload', { referral_booking_id: verifying.id })
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!verifying,
  });

  const filtered = (bookings ?? []).filter((b: any) => {
    if (filter === 'pending_verify' && (b.spend_verified || !['attended', 'confirmed'].includes(b.booking_status))) return false;
    if (filter === 'verified' && !b.spend_verified) return false;
    if (filter === 'commission_pending' && (b.commission_status !== 'pending' || !b.spend_verified)) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = (b.referrers as any)?.full_name?.toLowerCase() || '';
      const guest = b.guest_name?.toLowerCase() || '';
      if (!name.includes(s) && !guest.includes(s)) return false;
    }
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <PageHeader
          title="Referrals"
          description="Track clicks, bookings, verified spend, and commissions from your partners."
        />
        <BetaBadge />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={MousePointerClick} label="Referral Clicks" value={stats?.clicks ?? 0} />
        <StatCard icon={CalendarCheck} label="Attributed Bookings" value={stats?.bookings ?? 0} />
        <StatCard icon={Clock} label="Pending Verification" value={stats?.pendingVerify ?? 0} variant={stats?.pendingVerify ? 'warning' : 'default'} />
        <StatCard icon={DollarSign} label="Commissions Pending" value={stats?.pendingCommission ?? 0} variant={stats?.pendingCommission ? 'warning' : 'default'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by partner or guest…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Referrals</SelectItem>
            <SelectItem value="pending_verify">Pending Verification</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="commission_pending">Commission Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading referrals…</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Link2}
              title="No referral activity yet"
              description="Once partners start sharing links or bringing bookings, activity will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Party</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.booking_datetime ? new Date(b.booking_datetime).toLocaleDateString() : new Date(b.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{(b.referrers as any)?.full_name || '—'}</TableCell>
                    <TableCell className="text-sm">{b.guest_name || '—'}</TableCell>
                    <TableCell><BookingStatusBadge status={b.booking_status} /></TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{b.party_size || '—'}</TableCell>
                    <TableCell>
                      {b.spend_verified ? (
                        <span className="text-sm font-medium">£{b.verified_spend}</span>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20">Unverified</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.commission_amount != null ? (
                        <div>
                          <span className="text-sm font-medium">£{b.commission_amount}</span>
                          <CommissionStatusBadge status={b.commission_status} />
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {!b.spend_verified && ['attended', 'confirmed'].includes(b.booking_status) && (
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setVerifying(b)}>
                          <Receipt className="w-3 h-3" />Verify
                        </Button>
                      )}
                      {b.spend_verified && b.commission_status === 'pending' && (
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setVerifying(b)}>
                          <CheckCircle2 className="w-3 h-3" />Review
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Verification Sheet */}
      <VerificationSheet
        booking={verifying}
        onClose={() => setVerifying(null)}
        auditEvents={auditEvents ?? []}
      />
    </motion.div>
  );
}

function VerificationSheet({ booking, onClose, auditEvents }: { booking: any; onClose: () => void; auditEvents: any[] }) {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [spend, setSpend] = useState(booking?.verified_spend?.toString() || '');
  const [billUrl, setBillUrl] = useState(booking?.bill_image_url || '');

  // Commission calc placeholder
  const PULSE_FEE_RATE = 0.05; // 5% placeholder
  const spendNum = parseFloat(spend) || 0;
  const commissionAmount = booking?.offer_id ? spendNum * 0.1 : 0; // placeholder 10%
  const pulseFee = commissionAmount * PULSE_FEE_RATE;
  const netPayout = commissionAmount - pulseFee;

  const verify = useMutation({
    mutationFn: async (action: 'approve' | 'reject') => {
      if (!currentVenue || !booking) throw new Error('Missing data');
      const updates: any = {};
      if (action === 'approve') {
        updates.spend_verified = true;
        updates.verified_spend = spendNum;
        updates.verified_at = new Date().toISOString();
        updates.bill_image_url = billUrl || null;
        updates.commission_amount = commissionAmount;
        updates.commission_status = 'pending';
      } else {
        updates.commission_status = 'rejected';
      }
      const { error } = await supabase.from('referral_bookings').update(updates).eq('id', booking.id);
      if (error) throw error;
      await supabase.from('referral_audit_events').insert({
        venue_id: currentVenue.id,
        actor_user_id: user?.id,
        event_type: action === 'approve' ? 'spend_verified' : 'commission_rejected',
        event_payload: { referral_booking_id: booking.id, verified_spend: spendNum, action },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-bookings'] });
      qc.invalidateQueries({ queryKey: ['referral-overview-stats'] });
      toast.success('Verification updated');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveCommission = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error('No booking');
      const { error } = await supabase.from('referral_bookings').update({ commission_status: 'approved' }).eq('id', booking.id);
      if (error) throw error;
      await supabase.from('referral_audit_events').insert({
        venue_id: currentVenue!.id,
        actor_user_id: user?.id,
        event_type: 'commission_approved',
        event_payload: { referral_booking_id: booking.id },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-bookings'] });
      toast.success('Commission approved');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Sheet open={!!booking} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        {booking && (
          <>
            <SheetHeader>
              <SheetTitle>
                {booking.spend_verified ? 'Review Commission' : 'Verify Spend'}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-6 mt-6">
              {/* Booking Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30 border">
                <div><p className="text-[10px] text-muted-foreground uppercase">Partner</p><p className="text-sm font-medium">{(booking.referrers as any)?.full_name || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase">Guest</p><p className="text-sm font-medium">{booking.guest_name || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase">Date</p><p className="text-sm">{booking.booking_datetime ? new Date(booking.booking_datetime).toLocaleDateString() : '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase">Party Size</p><p className="text-sm">{booking.party_size || '—'}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase">Source</p><p className="text-sm">{booking.booking_source}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase">Status</p><BookingStatusBadge status={booking.booking_status} /></div>
              </div>

              {!booking.spend_verified ? (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Spend Verification</h4>
                    <div><Label>Bill Image URL (optional)</Label><Input value={billUrl} onChange={(e) => setBillUrl(e.target.value)} placeholder="Paste URL or leave blank" /></div>
                    <div><Label>Verified Spend (£) *</Label><Input type="number" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="0.00" /></div>
                    {spendNum > 0 && (
                      <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Verified Spend</span><span className="font-medium">£{spendNum.toFixed(2)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Partner Commission</span><span className="font-medium text-accent">£{commissionAmount.toFixed(2)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pulse Fee (5%)</span><span>£{pulseFee.toFixed(2)}</span></div>
                        <Separator />
                        <div className="flex justify-between text-sm font-medium"><span>Net Payout</span><span>£{netPayout.toFixed(2)}</span></div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => verify.mutate('approve')} disabled={spendNum <= 0 || verify.isPending}>
                        <ShieldCheck className="w-4 h-4 mr-2" />Approve Verification
                      </Button>
                      <Button variant="outline" onClick={() => verify.mutate('reject')} disabled={verify.isPending}>
                        <XCircle className="w-4 h-4 mr-2" />Reject
                      </Button>
                    </div>
                  </div>
                </>
              ) : booking.commission_status === 'pending' ? (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Commission Review</h4>
                    <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Verified Spend</span><span>£{booking.verified_spend}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Commission</span><span className="font-medium text-accent">£{booking.commission_amount}</span></div>
                    </div>
                    <Button className="w-full" onClick={() => approveCommission.mutate()} disabled={approveCommission.isPending}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />Approve Commission
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">Commission {booking.commission_status}</p>
                  <p className="text-xs text-muted-foreground mt-1">£{booking.commission_amount}</p>
                </div>
              )}

              {/* Audit Trail */}
              {auditEvents.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-3">Audit Trail</h4>
                    <div className="space-y-2">
                      {auditEvents.map((e: any) => (
                        <div key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                          <span className="font-medium">{e.event_type.replace(/_/g, ' ')}</span>
                          <span className="ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatCard({ icon: Icon, label, value, variant = 'default' }: { icon: any; label: string; value: number; variant?: 'default' | 'warning' }) {
  return (
    <Card className={variant === 'warning' && value > 0 ? 'border-amber-500/30 bg-amber-500/5' : ''}>
      <CardContent className="p-4">
        <Icon className={`w-5 h-5 mb-2 ${variant === 'warning' && value > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    confirmed: 'bg-accent/10 text-accent border-accent/20',
    attended: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  return <Badge variant="outline" className={`text-xs ${map[status] || ''}`}>{status}</Badge>;
}

function CommissionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'text-amber-500',
    approved: 'text-accent',
    paid: 'text-emerald-500',
    rejected: 'text-destructive',
  };
  return <span className={`text-[10px] ml-1 ${map[status] || ''}`}>{status}</span>;
}
