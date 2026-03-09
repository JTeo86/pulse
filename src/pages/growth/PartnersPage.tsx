import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { ReferralGuard, BetaBadge } from '@/components/referral/ReferralGuard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import {
  Users, Plus, Download, Search, Eye, Pause, Send, Trash2,
  Instagram, Mail, Link2, QrCode, DollarSign, MousePointerClick, CalendarCheck
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  influencer: 'Influencer',
  concierge: 'Concierge',
  agent: 'Agent',
  creator: 'Creator',
  planner: 'Event Planner',
  other: 'Other',
};

export default function PartnersPage() {
  return (
    <ReferralGuard>
      <PartnersContent />
    </ReferralGuard>
  );
}

function PartnersContent() {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedPartner, setSelectedPartner] = useState<any>(null);

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

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['partner-stats', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return { active: 0, pending: 0 };
      const [active, pending] = await Promise.all([
        supabase.from('referrers').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('status', 'active'),
        supabase.from('referrers').select('*', { count: 'exact', head: true }).eq('venue_id', currentVenue.id).eq('status', 'invited'),
      ]);
      return { active: active.count ?? 0, pending: pending.count ?? 0 };
    },
    enabled: !!currentVenue,
  });

  // Referral links for detail panel
  const { data: partnerLinks } = useQuery({
    queryKey: ['partner-links', selectedPartner?.id],
    queryFn: async () => {
      if (!selectedPartner) return [];
      const { data, error } = await supabase
        .from('referral_links')
        .select('*, venue_offers(title)')
        .eq('referrer_id', selectedPartner.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedPartner,
  });

  const filtered = (partners ?? []).filter((p: any) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (roleFilter !== 'all' && p.role_type !== roleFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!p.full_name.toLowerCase().includes(s) && !p.email.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('referrers').update({ status }).eq('id', id);
      if (error) throw error;
      // Audit
      if (currentVenue) {
        await supabase.from('referral_audit_events').insert({
          venue_id: currentVenue.id,
          actor_user_id: user?.id,
          event_type: status === 'paused' ? 'referrer_paused' : status === 'active' ? 'referrer_activated' : 'referrer_removed',
          event_payload: { referrer_id: id, new_status: status },
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrers'] });
      qc.invalidateQueries({ queryKey: ['partner-stats'] });
      toast.success('Partner updated');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <PageHeader
            title="Partners"
            description="Manage influencers, concierges, agents, and other partners who drive guests to your venue."
          />
          <BetaBadge />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />Export
          </Button>
          <Dialog open={showInvite} onOpenChange={setShowInvite}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Invite Partner</Button>
            </DialogTrigger>
            <InvitePartnerDialog
              onClose={() => setShowInvite(false)}
            />
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Active Partners" value={stats?.active ?? 0} icon={Users} />
        <SummaryCard label="Pending Invites" value={stats?.pending ?? 0} icon={Send} />
        <SummaryCard label="Top Partner" value="—" icon={DollarSign} subtle />
        <SummaryCard label="Revenue Attributed" value="—" icon={DollarSign} subtle />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search partners…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="influencer">Influencer</SelectItem>
            <SelectItem value="concierge">Concierge</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="creator">Creator</SelectItem>
            <SelectItem value="planner">Event Planner</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading partners…</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No partners yet"
              description="Invite influencers, concierges, or agents who can help bring guests to your venue."
              action={
                <Button size="sm" onClick={() => setShowInvite(true)} className="gap-2">
                  <Plus className="w-4 h-4" />Invite Partner
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Instagram</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p: any) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPartner(p)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{p.full_name}</p>
                        <p className="text-xs text-muted-foreground">{p.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{ROLE_LABELS[p.role_type] || p.role_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {p.instagram_handle ? (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Instagram className="w-3 h-3" />{p.instagram_handle}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedPartner(p)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {p.status === 'active' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateStatus.mutate({ id: p.id, status: 'paused' })}>
                            <Pause className="w-4 h-4" />
                          </Button>
                        )}
                        {p.status === 'paused' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateStatus.mutate({ id: p.id, status: 'active' })}>
                            <Send className="w-4 h-4 text-accent" />
                          </Button>
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

      {/* Detail Sheet */}
      <Sheet open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedPartner && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedPartner.full_name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Email" value={selectedPartner.email} icon={Mail} />
                  <DetailField label="Role" value={ROLE_LABELS[selectedPartner.role_type] || selectedPartner.role_type} icon={Users} />
                  <DetailField label="Status" value={selectedPartner.status} icon={CalendarCheck} />
                  {selectedPartner.instagram_handle && (
                    <DetailField label="Instagram" value={selectedPartner.instagram_handle} icon={Instagram} />
                  )}
                </div>
                {selectedPartner.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedPartner.notes}</p>
                  </div>
                )}
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3">Referral Links</h4>
                  {!partnerLinks?.length ? (
                    <p className="text-sm text-muted-foreground">No referral links generated yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {partnerLinks.map((link: any) => (
                        <div key={link.id} className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{(link.venue_offers as any)?.title || 'Offer'}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">{link.code}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(link.destination_url || link.code); toast.success('Link copied'); }}>
                              <Link2 className="w-4 h-4" />
                            </Button>
                            {link.qr_code_url && (
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <QrCode className="w-4 h-4" />
                              </Button>
                            )}
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

function InvitePartnerDialog({ onClose }: { onClose: () => void }) {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: '', email: '', role_type: 'influencer', instagram_handle: '', notes: '',
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!currentVenue) throw new Error('No venue');
      const { error } = await supabase.from('referrers').insert({
        venue_id: currentVenue.id,
        full_name: form.full_name,
        email: form.email.toLowerCase().trim(),
        role_type: form.role_type,
        instagram_handle: form.instagram_handle || null,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
      await supabase.from('referral_audit_events').insert({
        venue_id: currentVenue.id,
        actor_user_id: user?.id,
        event_type: 'referrer_invited',
        event_payload: { email: form.email, role_type: form.role_type },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrers'] });
      qc.invalidateQueries({ queryKey: ['partner-stats'] });
      toast.success('Partner invited successfully');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Invite a Partner</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground -mt-2">
        Add someone who will promote your venue and earn commission on referred bookings.
      </p>
      <div className="space-y-4 mt-2">
        <div><Label>Full Name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Sarah Chen" /></div>
        <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="partner@example.com" /></div>
        <div>
          <Label>Partner Type</Label>
          <Select value={form.role_type} onValueChange={(v) => setForm({ ...form, role_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="influencer">Influencer</SelectItem>
              <SelectItem value="concierge">Concierge</SelectItem>
              <SelectItem value="agent">Booking Agent</SelectItem>
              <SelectItem value="creator">Content Creator</SelectItem>
              <SelectItem value="planner">Event Planner</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Instagram (optional)</Label><Input value={form.instagram_handle} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} placeholder="@handle" /></div>
        <div><Label>Note (optional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context about this partner…" rows={2} /></div>
        <Button onClick={() => invite.mutate()} disabled={!form.full_name || !form.email || invite.isPending} className="w-full">
          {invite.isPending ? 'Inviting…' : 'Send Invite'}
        </Button>
      </div>
    </DialogContent>
  );
}

function SummaryCard({ label, value, icon: Icon, subtle }: { label: string; value: number | string; icon: any; subtle?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon className={`w-5 h-5 mb-2 ${subtle ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
        <p className={`text-2xl font-bold ${subtle ? 'text-muted-foreground' : ''}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    invited: 'bg-accent/10 text-accent border-accent/20',
    paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  return <Badge variant="outline" className={`text-xs ${styles[status] || ''}`}>{status}</Badge>;
}

function DetailField({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
