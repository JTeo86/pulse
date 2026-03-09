import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { ReferralGuard, BetaBadge } from '@/components/referral/ReferralGuard';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { Gift, Plus, Pause, Play, Copy, Archive, Users } from 'lucide-react';

export default function OffersPage() {
  return (
    <ReferralGuard>
      <OffersContent />
    </ReferralGuard>
  );
}

function OffersContent() {
  const { currentVenue } = useVenue();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

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

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('venue_offers').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venue-offers'] });
      toast.success('Offer updated');
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = {
    active: offers?.filter((o: any) => o.status === 'active').length ?? 0,
    draft: offers?.filter((o: any) => o.status === 'draft').length ?? 0,
    total: offers?.length ?? 0,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <PageHeader
            title="Offers"
            description="Create and manage referral offers for your partners. Define what partners earn when they bring guests."
          />
          <BetaBadge />
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" />Create Offer</Button>
          </DialogTrigger>
          <CreateOfferDialog onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><Gift className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-2xl font-bold">{stats.active}</p><p className="text-xs text-muted-foreground mt-1">Active Offers</p></CardContent></Card>
        <Card><CardContent className="p-4"><Gift className="w-5 h-5 text-muted-foreground/50 mb-2" /><p className="text-2xl font-bold text-muted-foreground">{stats.draft}</p><p className="text-xs text-muted-foreground mt-1">Drafts</p></CardContent></Card>
        <Card><CardContent className="p-4"><Users className="w-5 h-5 text-muted-foreground/50 mb-2" /><p className="text-2xl font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground mt-1">Assigned Partners</p></CardContent></Card>
      </div>

      {/* Offers Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading offers…</div>
      ) : !offers?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={Gift}
              title="No offers yet"
              description="Set up a reward structure so partners know what they can earn when referring guests."
              action={
                <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
                  <Plus className="w-4 h-4" />Create Offer
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((o: any) => (
            <Card key={o.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{o.title}</CardTitle>
                  <OfferStatusBadge status={o.status} />
                </div>
                {o.description && <CardDescription className="text-xs line-clamp-2">{o.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-accent">
                    {o.commission_type === 'percentage' ? `${o.commission_value}%` : `£${o.commission_value}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {o.commission_type === 'percentage' ? 'of verified spend' : 'per booking'}
                  </span>
                </div>

                {(o.start_date || o.end_date) && (
                  <p className="text-xs text-muted-foreground">
                    {o.start_date && new Date(o.start_date).toLocaleDateString()}
                    {o.start_date && o.end_date && ' – '}
                    {o.end_date && new Date(o.end_date).toLocaleDateString()}
                  </p>
                )}

                <div className="flex gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {o.status === 'draft' && (
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => updateStatus.mutate({ id: o.id, status: 'active' })}>
                      <Play className="w-3 h-3" />Activate
                    </Button>
                  )}
                  {o.status === 'active' && (
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => updateStatus.mutate({ id: o.id, status: 'paused' })}>
                      <Pause className="w-3 h-3" />Pause
                    </Button>
                  )}
                  {o.status === 'paused' && (
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => updateStatus.mutate({ id: o.id, status: 'active' })}>
                      <Play className="w-3 h-3" />Resume
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => updateStatus.mutate({ id: o.id, status: 'archived' })}>
                    <Archive className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CreateOfferDialog({ onClose }: { onClose: () => void }) {
  const { currentVenue } = useVenue();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '', description: '', commission_type: 'percentage', commission_value: '10',
    start_date: '', end_date: '',
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
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venue-offers'] });
      toast.success('Offer created');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Create Referral Offer</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground -mt-2">Define what your partners earn when they refer guests.</p>
      <div className="space-y-4 mt-2">
        <div><Label>Offer Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekend Dining 10%" /></div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of this offer…" rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Commission Structure</Label>
            <Select value={form.commission_type} onValueChange={(v) => setForm({ ...form, commission_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage of Spend</SelectItem>
                <SelectItem value="fixed">Fixed per Booking</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Partner Reward {form.commission_type === 'percentage' ? '(%)' : '(£)'}</Label>
            <Input type="number" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Active From (optional)</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div><Label>Active Until (optional)</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
        </div>
        <Button onClick={() => create.mutate()} disabled={!form.title || create.isPending} className="w-full">
          {create.isPending ? 'Creating…' : 'Create Offer'}
        </Button>
      </div>
    </DialogContent>
  );
}

function OfferStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    draft: 'bg-muted text-muted-foreground border-border',
    paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    archived: 'bg-muted text-muted-foreground/60 border-border',
  };
  return <Badge variant="outline" className={`text-xs ${map[status] || ''}`}>{status}</Badge>;
}
