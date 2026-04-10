import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { ReferralGuard } from '@/components/referral/ReferralGuard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Link2, CalendarCheck, DollarSign, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const editableStatuses = ['created', 'submitted', 'clicked', 'booking_confirmed', 'visited', 'bill_entered', 'verified', 'paid'] as const;

type UnifiedStatus = typeof editableStatuses[number];

export default function ReferralsPage() {
  return (
    <ReferralGuard minimumStage={1}>
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

  const { data: referrals, isLoading } = useQuery({
    queryKey: ['unified-referrals', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('referrals')
        .select('*, referrers(full_name, email)')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(250);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const { data: stats } = useQuery({
    queryKey: ['unified-referral-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [total, booked, verified] = await Promise.all([
        supabase.from('referrals').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id),
        supabase.from('referrals').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).in('status', ['booking_confirmed', 'visited', 'bill_entered', 'verified', 'paid']),
        supabase.from('referrals').select('commission').eq('venue_id', currentVenue.id).in('status', ['verified', 'paid']),
      ]);
      const verifiedCommission = (verified.data ?? []).reduce((sum, row: any) => sum + (Number(row.commission) || 0), 0);
      return { total: total.count ?? 0, booked: booked.count ?? 0, verifiedCommission };
    },
    enabled: !!currentVenue,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UnifiedStatus }) => {
      const { error } = await supabase.from('referrals').update({ status }).eq('id', id);
      if (error) throw error;
      if (currentVenue) {
        await supabase.from('referral_audit_events').insert({
          venue_id: currentVenue.id,
          actor_user_id: user?.id,
          event_type: 'referral_status_updated',
          event_payload: { referral_id: id, status },
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unified-referrals'] });
      qc.invalidateQueries({ queryKey: ['unified-referral-stats'] });
      toast.success('Referral status updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (referrals ?? []).filter((r: any) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    const partner = (r.referrers as any)?.full_name?.toLowerCase() || '';
    const guest = (r.guest_name || '').toLowerCase();
    const code = (r.promo_code || '').toLowerCase();
    return partner.includes(s) || guest.includes(s) || code.includes(s);
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Referrals"
        description="One unified list for direct submissions, tracked links, promo codes, and manual entries."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Referrals" value={stats?.total ?? 0} icon={Link2} />
        <StatCard label="Booking Confirmed+" value={stats?.booked ?? 0} icon={CalendarCheck} />
        <StatCard label="Verified Commission" value={`£${(stats?.verifiedCommission ?? 0).toFixed(2)}`} icon={DollarSign} />
        <StatCard label="Unified Tracking" value="Active" icon={ShieldCheck} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search partner, guest, or promo code…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {editableStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading referrals…</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Link2}
              title="No referrals yet"
              description="Direct, link, code, and manual entries all appear in this one unified list."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.booking_date || r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm font-medium">{(r.referrers as any)?.full_name || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{r.source_type}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize text-xs">{r.status}</Badge></TableCell>
                    <TableCell><ConfidenceBadge confidence={r.attribution_confidence} /></TableCell>
                    <TableCell>{r.party_size ?? '—'}</TableCell>
                    <TableCell>{r.bill_amount != null ? `£${Number(r.bill_amount).toFixed(2)}` : '—'}</TableCell>
                    <TableCell>{r.commission != null ? `£${Number(r.commission).toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Select value={r.status} onValueChange={(status: UnifiedStatus) => updateStatus.mutate({ id: r.id, status })}>
                        <SelectTrigger className="w-[170px] ml-auto h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {editableStatuses.map((status) => <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>)}
                        </SelectContent>
                      </Select>
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

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === 'high') return <Badge className="bg-success/10 text-success text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />High</Badge>;
  if (confidence === 'medium') return <Badge className="bg-info/10 text-info text-xs">Medium</Badge>;
  return <Badge variant="outline" className="text-xs">Low</Badge>;
}
