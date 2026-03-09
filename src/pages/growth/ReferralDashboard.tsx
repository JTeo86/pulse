import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import {
  Network, Users, Gift, Link2, BarChart3, Wallet,
  Plus, Copy, CheckCircle2, Clock, DollarSign, Eye
} from 'lucide-react';

export default function ReferralDashboard() {
  const { currentVenue } = useVenue();
  const { venueHasAccess, isBetaVenue, flags, isLoading: accessLoading } = useReferralAccess();
  const [activeTab, setActiveTab] = useState('overview');

  if (accessLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!venueHasAccess) {
    return <Navigate to="/home" replace />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <PageHeader
          title="Referral Network"
          description="Track partners, offers, referrals, and payouts."
        />
        {isBetaVenue && !flags.publicLaunch && (
          <Badge className="bg-accent/20 text-accent border-accent/30">Beta</Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2"><BarChart3 className="w-4 h-4" />Overview</TabsTrigger>
          <TabsTrigger value="partners" className="gap-2"><Users className="w-4 h-4" />Partners</TabsTrigger>
          <TabsTrigger value="offers" className="gap-2"><Gift className="w-4 h-4" />Offers</TabsTrigger>
          <TabsTrigger value="referrals" className="gap-2"><Link2 className="w-4 h-4" />Referrals</TabsTrigger>
          <TabsTrigger value="payouts" className="gap-2"><Wallet className="w-4 h-4" />Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="partners" className="mt-6">
          <PartnersTab />
        </TabsContent>
        <TabsContent value="offers" className="mt-6">
          <OffersTab />
        </TabsContent>
        <TabsContent value="referrals" className="mt-6">
          <ReferralsTab />
        </TabsContent>
        <TabsContent value="payouts" className="mt-6">
          <PayoutsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ---- Overview Tab ----
function OverviewTab() {
  const { currentVenue } = useVenue();
  const { flags } = useReferralAccess();

  const { data: stats } = useQuery({
    queryKey: ['referral-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;
      const [partners, offers, bookings, pendingVerify] = await Promise.all([
        supabase.from('referrers').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('status', 'active'),
        supabase.from('venue_offers').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('status', 'active'),
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id),
        supabase.from('referral_bookings').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('spend_verified', false).eq('booking_status', 'attended'),
      ]);
      return {
        activePartners: partners.count ?? 0,
        activeOffers: offers.count ?? 0,
        totalBookings: bookings.count ?? 0,
        pendingVerification: pendingVerify.count ?? 0,
      };
    },
    enabled: !!currentVenue,
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Partners" value={stats?.activePartners ?? 0} />
        <StatCard icon={Gift} label="Active Offers" value={stats?.activeOffers ?? 0} />
        <StatCard icon={CheckCircle2} label="Total Bookings" value={stats?.totalBookings ?? 0} />
        <StatCard icon={Clock} label="Pending Verification" value={stats?.pendingVerification ?? 0} variant={stats?.pendingVerification ? 'warning' : 'default'} />
      </div>

      {!flags.stripeEnabled && (
        <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-500" />
            <p className="text-sm"><span className="font-medium text-amber-500">Manual payout mode</span> — Stripe Connect is not configured. Payouts require manual processing.</p>
          </div>
        </div>
      )}
    </div>
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

// ---- Partners Tab ----
function PartnersTab() {
  const { currentVenue } = useVenue();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', role_type: 'influencer', instagram_handle: '', notes: '' });

  const { data: partners, isLoading } = useQuery({
    queryKey: ['referrers', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('referrers')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!currentVenue) throw new Error('No venue');
      const { error } = await supabase.from('referrers').insert({
        venue_id: currentVenue.id,
        full_name: form.full_name,
        email: form.email,
        role_type: form.role_type,
        instagram_handle: form.instagram_handle || null,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrers'] });
      setShowInvite(false);
      setForm({ full_name: '', email: '', role_type: 'influencer', instagram_handle: '', notes: '' });
      toast.success('Partner invited');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Partners</h3>
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Invite Partner</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite Partner</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div>
                <Label>Role</Label>
                <Select value={form.role_type} onValueChange={(v) => setForm({ ...form, role_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="concierge">Concierge</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="creator">Creator</SelectItem>
                    <SelectItem value="planner">Event Planner</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Instagram (optional)</Label><Input value={form.instagram_handle} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} placeholder="@handle" /></div>
              <div><Label>Notes (optional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={() => invite.mutate()} disabled={!form.full_name || !form.email || invite.isPending} className="w-full">Invite</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : !partners?.length ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No partners yet. Invite your first partner to get started.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{p.email}</TableCell>
                <TableCell><Badge variant="outline">{p.role_type}</Badge></TableCell>
                <TableCell>
                  <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}

// ---- Offers Tab ----
function OffersTab() {
  const { currentVenue } = useVenue();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', commission_type: 'percentage', commission_value: '10' });

  const { data: offers, isLoading } = useQuery({
    queryKey: ['venue-offers', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('venue_offers')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!currentVenue) throw new Error('No venue');
      const { error } = await supabase.from('venue_offers').insert({
        venue_id: currentVenue.id,
        title: form.title,
        description: form.description,
        commission_type: form.commission_type,
        commission_value: parseFloat(form.commission_value) || 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venue-offers'] });
      setShowCreate(false);
      setForm({ title: '', description: '', commission_type: 'percentage', commission_value: '10' });
      toast.success('Offer created');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Offers</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Create Offer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Referral Offer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekend Dining 10%" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Commission Type</Label>
                  <Select value={form.commission_type} onValueChange={(v) => setForm({ ...form, commission_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value {form.commission_type === 'percentage' ? '(%)' : '(£)'}</Label>
                  <Input type="number" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
                </div>
              </div>
              <Button onClick={() => create.mutate()} disabled={!form.title || create.isPending} className="w-full">Create Offer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : !offers?.length ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No offers yet. Create your first referral offer.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {offers.map((o: any) => (
            <Card key={o.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{o.title}</CardTitle>
                  <Badge variant={o.status === 'active' ? 'default' : 'secondary'}>{o.status}</Badge>
                </div>
                <CardDescription>{o.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-accent">
                  {o.commission_type === 'percentage' ? `${o.commission_value}%` : `£${o.commission_value}`}
                  <span className="text-xs text-muted-foreground font-normal ml-1">commission</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Referrals Tab ----
function ReferralsTab() {
  const { currentVenue } = useVenue();

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['referral-bookings', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];
      const { data, error } = await supabase
        .from('referral_bookings')
        .select('*, referrers(full_name)')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Referral Bookings</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : !bookings?.length ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No referral bookings yet. Share referral links with your partners to start tracking.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verified Spend</TableHead>
              <TableHead>Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell>{b.guest_name || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{(b.referrers as any)?.full_name || '—'}</TableCell>
                <TableCell><Badge variant="outline">{b.booking_status}</Badge></TableCell>
                <TableCell>{b.spend_verified ? `£${b.verified_spend}` : <span className="text-amber-500">Pending</span>}</TableCell>
                <TableCell>
                  {b.commission_amount != null ? (
                    <Badge variant={b.commission_status === 'paid' ? 'default' : 'secondary'}>
                      £{b.commission_amount} • {b.commission_status}
                    </Badge>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---- Payouts Tab ----
function PayoutsTab() {
  const { currentVenue } = useVenue();
  const { flags } = useReferralAccess();

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Payouts</h3>
        {!flags.stripeEnabled && (
          <Badge variant="outline" className="text-amber-500 border-amber-500/30">Manual Mode</Badge>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : !batches?.length ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No payout batches yet. Commissions will accumulate as referral bookings are verified.</CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Total Commission</TableHead>
              <TableHead>Pulse Fee</TableHead>
              <TableHead>Net Payout</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.batch_month}</TableCell>
                <TableCell>£{b.total_commission}</TableCell>
                <TableCell className="text-muted-foreground">£{b.pulse_fee}</TableCell>
                <TableCell className="font-medium">£{b.net_payout}</TableCell>
                <TableCell><Badge variant={b.status === 'paid' ? 'default' : 'secondary'}>{b.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
