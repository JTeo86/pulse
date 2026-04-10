import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function SubscriptionTiersTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    slug: '', name: '', stripe_price_id_monthly: '', monthly_image_quota: '0', monthly_storage_mb: '0', max_users_per_venue: '1', description: '',
  });

  const { data: tiers, error, isError } = useQuery({
    queryKey: ['subscription-tiers-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscription_tiers').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const schemaNotReady = ((error as { message?: string; code?: string } | null)?.code === '42P01')
    || ((error as { message?: string; code?: string } | null)?.code === 'PGRST205')
    || ((error as { message?: string } | null)?.message?.toLowerCase().includes('does not exist') ?? false);

  if (isError && schemaNotReady) {
    return (
      <Card className="border-warning/50">
        <CardHeader>
          <CardTitle>Subscription tiers unavailable</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          Apply migration <code>20260410220000_billing_subscriptions_entitlements.sql</code> before using this tab.
        </CardContent>
      </Card>
    );
  }

  const saveTier = async (tier: any) => {
    const { error } = await supabase.from('subscription_tiers').upsert(tier, { onConflict: 'id' });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['subscription-tiers-admin'] });
  };

  const createTier = async () => {
    const { error } = await supabase.from('subscription_tiers').insert({
      ...draft,
      monthly_image_quota: Number(draft.monthly_image_quota),
      monthly_storage_mb: Number(draft.monthly_storage_mb),
      max_users_per_venue: Number(draft.max_users_per_venue),
      feature_summary_json: [],
    });
    if (error) throw error;
    setDraft({ slug: '', name: '', stripe_price_id_monthly: '', monthly_image_quota: '0', monthly_storage_mb: '0', max_users_per_venue: '1', description: '' });
    queryClient.invalidateQueries({ queryKey: ['subscription-tiers-admin'] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Create tier</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Input placeholder="slug" value={draft.slug} onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))} />
          <Input placeholder="name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Stripe monthly price ID" value={draft.stripe_price_id_monthly} onChange={(e) => setDraft((p) => ({ ...p, stripe_price_id_monthly: e.target.value }))} />
          <Input placeholder="Image quota" type="number" value={draft.monthly_image_quota} onChange={(e) => setDraft((p) => ({ ...p, monthly_image_quota: e.target.value }))} />
          <Input placeholder="Storage MB" type="number" value={draft.monthly_storage_mb} onChange={(e) => setDraft((p) => ({ ...p, monthly_storage_mb: e.target.value }))} />
          <Input placeholder="Max users" type="number" value={draft.max_users_per_venue} onChange={(e) => setDraft((p) => ({ ...p, max_users_per_venue: e.target.value }))} />
          <Input className="md:col-span-2" placeholder="Description" value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
          <Button className="md:col-span-2" onClick={createTier}>Create tier</Button>
        </CardContent>
      </Card>

      {tiers?.map((tier) => (
        <Card key={tier.id}>
          <CardHeader><CardTitle>{tier.name}</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3 items-end">
            <div><Label>Sort order</Label><Input type="number" value={tier.sort_order} onChange={(e) => saveTier({ id: tier.id, sort_order: Number(e.target.value) })} /></div>
            <div><Label>Stripe monthly price ID</Label><Input value={tier.stripe_price_id_monthly || ''} onChange={(e) => saveTier({ id: tier.id, stripe_price_id_monthly: e.target.value })} /></div>
            <div className="flex items-center gap-3 border rounded px-3 h-10"><Label>Active</Label><Switch checked={tier.is_active} onCheckedChange={(v) => saveTier({ id: tier.id, is_active: v })} /></div>
            <div><Label>Monthly image quota</Label><Input type="number" value={tier.monthly_image_quota} onChange={(e) => saveTier({ id: tier.id, monthly_image_quota: Number(e.target.value) })} /></div>
            <div><Label>Monthly storage (MB)</Label><Input type="number" value={tier.monthly_storage_mb} onChange={(e) => saveTier({ id: tier.id, monthly_storage_mb: Number(e.target.value) })} /></div>
            <div><Label>Max users/venue</Label><Input type="number" value={tier.max_users_per_venue} onChange={(e) => saveTier({ id: tier.id, max_users_per_venue: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-3 border rounded px-3 h-10"><Label>Marketplace access</Label><Switch checked={tier.marketplace_access_enabled} onCheckedChange={(v) => saveTier({ id: tier.id, marketplace_access_enabled: v })} /></div>
            <div className="flex items-center gap-3 border rounded px-3 h-10"><Label>Video PAYG enabled</Label><Switch checked={tier.video_payg_enabled} onCheckedChange={(v) => saveTier({ id: tier.id, video_payg_enabled: v })} /></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
