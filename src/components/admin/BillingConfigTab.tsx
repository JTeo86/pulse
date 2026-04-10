import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { updatePlatformKey } from '@/lib/platform-keys';

export default function BillingConfigTab() {
  const queryClient = useQueryClient();
  const [secretKey, setSecretKey] = useState('');
  const [webhookKey, setWebhookKey] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});

  const { data, error, isError } = useQuery({
    queryKey: ['billing-config-settings'],
    queryFn: async () => {
      const [{ data: settingsRows, error: settingsError }] = await Promise.all([
        supabase.from('platform_settings').select('key, value').in('key', ['stripe_publishable_key', 'billing_customer_portal_enabled', 'billing_enforcement_mode', 'billing_default_trial_days', 'billing_test_mode_banner']),
      ]);
      if (settingsError) throw settingsError;
      return Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]));
    },
  });

  const merged = { ...(data ?? {}), ...local };
  const schemaNotReady = ((error as { message?: string; code?: string } | null)?.code === '42P01')
    || ((error as { message?: string; code?: string } | null)?.code === 'PGRST205')
    || ((error as { message?: string } | null)?.message?.toLowerCase().includes('does not exist') ?? false);

  if (isError && schemaNotReady) {
    return (
      <Card className="border-warning/50">
        <CardHeader>
          <CardTitle>Billing setup pending</CardTitle>
          <CardDescription>Billing configuration is unavailable until the latest billing schema and edge functions are deployed.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const setSetting = (key: string, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    for (const [key, value] of Object.entries(local)) {
      await supabase.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }
    setLocal({});
    queryClient.invalidateQueries({ queryKey: ['billing-config-settings'] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Config</CardTitle>
        <CardDescription>Global Stripe and billing behavior controls.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Stripe publishable key</Label>
          <Input value={merged.stripe_publishable_key ?? ''} onChange={(e) => setSetting('stripe_publishable_key', e.target.value)} placeholder="pk_live_..." />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Billing enforcement mode</Label>
            <Select value={merged.billing_enforcement_mode ?? 'soft'} onValueChange={(v) => setSetting('billing_enforcement_mode', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="soft">soft</SelectItem>
                <SelectItem value="hard">hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default trial days</Label>
            <Input type="number" value={merged.billing_default_trial_days ?? '0'} onChange={(e) => setSetting('billing_default_trial_days', e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between border rounded-lg p-3">
          <Label>Customer portal enabled</Label>
          <Switch checked={merged.billing_customer_portal_enabled === 'true'} onCheckedChange={(v) => setSetting('billing_customer_portal_enabled', String(v))} />
        </div>
        <div className="flex items-center justify-between border rounded-lg p-3">
          <Label>Billing test mode banner</Label>
          <Switch checked={merged.billing_test_mode_banner === 'true'} onCheckedChange={(v) => setSetting('billing_test_mode_banner', String(v))} />
        </div>

        <div className="pt-2 border-t space-y-3">
          <div className="space-y-2">
            <Label>Stripe secret key</Label>
            <Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="sk_live_..." />
            <Button size="sm" variant="outline" onClick={() => updatePlatformKey('STRIPE_SECRET_KEY', secretKey)}>Save secret key</Button>
          </div>
          <div className="space-y-2">
            <Label>Stripe webhook secret</Label>
            <Input type="password" value={webhookKey} onChange={(e) => setWebhookKey(e.target.value)} placeholder="whsec_..." />
            <Button size="sm" variant="outline" onClick={() => updatePlatformKey('STRIPE_WEBHOOK_SECRET', webhookKey)}>Save webhook secret</Button>
          </div>
        </div>
        <Button onClick={saveSettings} disabled={Object.keys(local).length === 0}>Save billing settings</Button>
      </CardContent>
    </Card>
  );
}
