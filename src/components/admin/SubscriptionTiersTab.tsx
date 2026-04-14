import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { isFunctionNotDeployedError, isMissingBillingSchemaError } from '@/lib/billing-readiness';

type TierDraft = {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  stripe_price_id_monthly: string;
  monthly_image_quota: number;
  monthly_storage_mb: number;
  max_users_per_venue: number;
  marketplace_access_enabled: boolean;
  video_payg_enabled: boolean;
};

const RECOMMENDED_TIER_LIMITS: Record<string, { images: number; storageMb: number; users: number; featureAccess: string }> = {
  starter: { images: 60, storageMb: 2048, users: 2, featureAccess: 'Core Pro Photo + Content Queue' },
  growth: { images: 200, storageMb: 10240, users: 5, featureAccess: 'Starter + Marketplace workflows' },
  pro: { images: 500, storageMb: 25600, users: 10, featureAccess: 'Growth + advanced team capacity' },
};

const NEW_TIER_TEMPLATE = {
  slug: '',
  name: '',
  description: '',
  sort_order: '0',
  is_active: true,
  stripe_price_id_monthly: '',
  monthly_image_quota: '0',
  monthly_storage_mb: '0',
  max_users_per_venue: '1',
  marketplace_access_enabled: false,
  video_payg_enabled: false,
};

function hasRequiredIdentity(draft: TierDraft) {
  return Boolean(draft.name.trim()) && Boolean(draft.slug.trim());
}

function formatStorageLabel(storageMb: number) {
  if (storageMb >= 1024) {
    const gb = storageMb / 1024;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  return `${storageMb} MB`;
}

function toTierDraft(tier: any): TierDraft {
  return {
    id: tier.id,
    slug: tier.slug || '',
    name: tier.name || '',
    description: tier.description || '',
    is_active: Boolean(tier.is_active),
    sort_order: Number(tier.sort_order ?? 0),
    stripe_price_id_monthly: tier.stripe_price_id_monthly || '',
    monthly_image_quota: Number(tier.monthly_image_quota ?? 0),
    monthly_storage_mb: Number(tier.monthly_storage_mb ?? 0),
    max_users_per_venue: Number(tier.max_users_per_venue ?? 1),
    marketplace_access_enabled: Boolean(tier.marketplace_access_enabled),
    video_payg_enabled: Boolean(tier.video_payg_enabled),
  };
}

export default function SubscriptionTiersTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(NEW_TIER_TEMPLATE);
  const [edits, setEdits] = useState<Record<string, TierDraft>>({});

  const { data, error, isError } = useQuery({
    queryKey: ['subscription-tiers-admin'],
    queryFn: async () => {
      const [tiersRes, settingsRes, ...probeResults] = await Promise.all([
        supabase.from('subscription_tiers').select('*').order('sort_order').order('name'),
        supabase.from('platform_settings').select('value').eq('key', 'default_new_venue_tier_slug').maybeSingle(),
        supabase.functions.invoke('create-checkout-session', { body: {} }),
        supabase.functions.invoke('create-customer-portal-session', { body: {} }),
        supabase.functions.invoke('change-subscription-tier', { body: {} }),
        supabase.functions.invoke('stripe-webhook', { body: {} }),
      ]);
      if (tiersRes.error) throw tiersRes.error;
      return {
        tiers: tiersRes.data ?? [],
        defaultTierSlug: settingsRes.data?.value || '',
        missingFunctions: probeResults.some(({ error }) => isFunctionNotDeployedError(error)),
      };
    },
  });

  const schemaNotReady = isMissingBillingSchemaError(error);
  const tiers = data?.tiers ?? [];
  const defaultTierSlug = data?.defaultTierSlug || '';
  const functionsNotReady = Boolean(data?.missingFunctions);

  const hasEdit = (tier: any) => Boolean(edits[tier.id]);
  const getTier = (tier: any) => edits[tier.id] ?? toTierDraft(tier);

  const visibleDefaultTier = useMemo(
    () => tiers.find((tier) => tier.slug === defaultTierSlug) ?? tiers.find((tier) => tier.is_active),
    [tiers, defaultTierSlug],
  );

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

  const setTierField = <K extends keyof TierDraft>(tier: any, key: K, value: TierDraft[K]) => {
    setEdits((prev) => ({
      ...prev,
      [tier.id]: {
        ...getTier(tier),
        [key]: value,
      },
    }));
  };

  const saveTier = async (tier: any) => {
    const payload = edits[tier.id];
    if (!payload) return;
    if (!hasRequiredIdentity(payload)) {
      toast.error('Plan name and slug are required');
      return;
    }
    if (payload.is_active && !payload.stripe_price_id_monthly.trim()) {
      toast.warning(`Active tier "${payload.name || tier.name}" has no Stripe monthly price ID`);
    }

    const { error } = await supabase.from('subscription_tiers').upsert(
      {
        id: payload.id,
        slug: payload.slug,
        name: payload.name,
        description: payload.description,
        is_active: payload.is_active,
        sort_order: payload.sort_order,
        stripe_price_id_monthly: payload.stripe_price_id_monthly,
        monthly_image_quota: payload.monthly_image_quota,
        monthly_storage_mb: payload.monthly_storage_mb,
        max_users_per_venue: payload.max_users_per_venue,
        marketplace_access_enabled: payload.marketplace_access_enabled,
        video_payg_enabled: payload.video_payg_enabled,
      },
      { onConflict: 'id' },
    );

    if (error) {
      toast.error(`Failed to save ${tier.name}`);
      throw error;
    }

    setEdits((prev) => {
      const next = { ...prev };
      delete next[tier.id];
      return next;
    });
    toast.success(`${payload.name || tier.name} updated`);
    queryClient.invalidateQueries({ queryKey: ['subscription-tiers-admin'] });
  };

  const setDefaultTier = async (slug: string) => {
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ key: 'default_new_venue_tier_slug', value: slug, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
      toast.error('Failed to set default new-venue plan');
      throw error;
    }
    toast.success('Default new-venue plan updated');
    queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    queryClient.invalidateQueries({ queryKey: ['subscription-tiers-admin'] });
  };

  const deactivateTier = async (tier: any) => {
    const localTier = getTier(tier);
    setTierField(tier, 'is_active', false);
    if (localTier.is_active) {
      toast.message(`${localTier.name || tier.name} marked inactive. Save plan to persist.`);
    }
  };

  const applyRecommendedTierLimits = (tier: any) => {
    const localTier = getTier(tier);
    const recommendation = RECOMMENDED_TIER_LIMITS[(localTier.slug || '').toLowerCase()];
    if (!recommendation) return;
    setEdits((prev) => ({
      ...prev,
      [tier.id]: {
        ...localTier,
        monthly_image_quota: recommendation.images,
        monthly_storage_mb: recommendation.storageMb,
        max_users_per_venue: recommendation.users,
      },
    }));
    toast.success(`Applied recommended limits for ${localTier.name || tier.name}`);
  };

  const createTier = async () => {
    const { error } = await supabase.from('subscription_tiers').insert({
      slug: draft.slug,
      name: draft.name,
      description: draft.description,
      sort_order: Number(draft.sort_order),
      is_active: draft.is_active,
      stripe_price_id_monthly: draft.stripe_price_id_monthly,
      monthly_image_quota: Number(draft.monthly_image_quota),
      monthly_storage_mb: Number(draft.monthly_storage_mb),
      max_users_per_venue: Number(draft.max_users_per_venue),
      marketplace_access_enabled: draft.marketplace_access_enabled,
      video_payg_enabled: draft.video_payg_enabled,
      feature_summary_json: [],
    });
    if (error) throw error;

    setDraft(NEW_TIER_TEMPLATE);
    toast.success('New plan created');
    queryClient.invalidateQueries({ queryKey: ['subscription-tiers-admin'] });
  };

  return (
    <div className="space-y-4">
      {functionsNotReady && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Billing functions not deployed</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            Plan settings can be edited, but checkout and plan-change actions remain unavailable until billing edge functions are deployed.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Plan management</CardTitle>
          <CardDescription>
            Set plan identity first, then entitlements, then billing mapping. Default new-venue plan is managed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Default plan for new venues:{' '}
            <span className="font-medium text-foreground">
              {visibleDefaultTier ? `${visibleDefaultTier.name} (${visibleDefaultTier.slug})` : 'Auto-select first active plan'}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create plan</CardTitle>
          <CardDescription>Add a new tier and then refine details in its plan card below.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Plan name</Label>
            <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Growth" />
          </div>
          <div className="space-y-1">
            <Label>Slug</Label>
            <Input value={draft.slug} onChange={(e) => setDraft((p) => ({ ...p, slug: e.target.value }))} placeholder="growth" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Description</Label>
            <Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="For busy single-location teams" />
          </div>
          <Button className="md:col-span-2" onClick={createTier} disabled={!draft.slug.trim() || !draft.name.trim()}>
            Create plan
          </Button>
        </CardContent>
      </Card>

      {tiers.map((tier) => {
        const localTier = getTier(tier);
        const missingIdentity = !hasRequiredIdentity(localTier);
        const activeWithoutPriceId = localTier.is_active && !localTier.stripe_price_id_monthly.trim();
        const isDefault = defaultTierSlug
          ? defaultTierSlug === tier.slug
          : visibleDefaultTier?.slug === tier.slug;

        return (
          <Card key={tier.id} className={isDefault ? 'border-accent/40' : ''}>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{localTier.name || tier.name}</CardTitle>
                  <CardDescription>Plan slug: {localTier.slug || tier.slug}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isDefault && <Badge>Default for new venues</Badge>}
                  {localTier.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  <Badge variant="outline">
                    {localTier.monthly_image_quota} images / mo
                  </Badge>
                  <Badge variant="outline">
                    {formatStorageLabel(localTier.monthly_storage_mb)} storage
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button variant={isDefault ? 'secondary' : 'outline'} size="sm" onClick={() => setDefaultTier(localTier.slug || tier.slug)}>
                  {isDefault ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Circle className="mr-1.5 h-3.5 w-3.5" />}
                  {isDefault ? 'Default plan' : 'Set as default'}
                </Button>
                <span className="text-muted-foreground">Used when a venue is created and no explicit tier is chosen.</span>
              </div>

              {RECOMMENDED_TIER_LIMITS[(localTier.slug || '').toLowerCase()] && (
                <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
                  {(() => {
                    const recommendation = RECOMMENDED_TIER_LIMITS[(localTier.slug || '').toLowerCase()];
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-muted-foreground">
                          Real usage target: ~{recommendation.images} images · {formatStorageLabel(recommendation.storageMb)} · {recommendation.users} users · {recommendation.featureAccess}
                        </p>
                        <Button size="sm" variant="outline" onClick={() => applyRecommendedTierLimits(tier)}>
                          Apply real-usage defaults
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Plan identity</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={localTier.name} onChange={(e) => setTierField(tier, 'name', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Slug</Label>
                    <Input value={localTier.slug} onChange={(e) => setTierField(tier, 'slug', e.target.value)} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Description</Label>
                    <Input value={localTier.description} onChange={(e) => setTierField(tier, 'description', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Sort order</Label>
                    <Input type="number" value={localTier.sort_order} onChange={(e) => setTierField(tier, 'sort_order', Number(e.target.value))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <Label>Active status</Label>
                    <Switch checked={localTier.is_active} onCheckedChange={(v) => setTierField(tier, 'is_active', v)} />
                  </div>
                </div>
                {missingIdentity && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Plan name and slug are required before saving.
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Entitlements</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Monthly image quota</Label>
                    <Input type="number" value={localTier.monthly_image_quota} onChange={(e) => setTierField(tier, 'monthly_image_quota', Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Monthly storage quota (MB)</Label>
                    <Input type="number" value={localTier.monthly_storage_mb} onChange={(e) => setTierField(tier, 'monthly_storage_mb', Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Max users per venue</Label>
                    <Input type="number" value={localTier.max_users_per_venue} onChange={(e) => setTierField(tier, 'max_users_per_venue', Number(e.target.value))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <Label>Marketplace access</Label>
                    <Switch checked={localTier.marketplace_access_enabled} onCheckedChange={(v) => setTierField(tier, 'marketplace_access_enabled', v)} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 md:col-span-2">
                    <Label>Video PAYG eligibility</Label>
                    <Switch checked={localTier.video_payg_enabled} onCheckedChange={(v) => setTierField(tier, 'video_payg_enabled', v)} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Billing mapping</h4>
                <div className="space-y-1">
                  <Label>Stripe monthly price ID</Label>
                  <Input value={localTier.stripe_price_id_monthly} onChange={(e) => setTierField(tier, 'stripe_price_id_monthly', e.target.value)} placeholder="price_..." />
                </div>
                <p className="text-xs text-muted-foreground">Stripe mapping status: {localTier.stripe_price_id_monthly.trim() ? 'Mapped' : 'Missing mapping'}</p>
                {activeWithoutPriceId && (
                  <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Active plan has no Stripe monthly price ID; checkout may fail until this is set.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setDefaultTier(localTier.slug || tier.slug)} disabled={!localTier.slug.trim()}>
                  Set as default
                </Button>
                <Button variant="outline" onClick={() => deactivateTier(tier)} disabled={!localTier.is_active}>
                  Deactivate
                </Button>
                {hasEdit(tier) && (
                  <Button variant="outline" onClick={() => setEdits((prev) => {
                    const next = { ...prev };
                    delete next[tier.id];
                    return next;
                  })}>
                    Discard
                  </Button>
                )}
                <Button onClick={() => saveTier(tier)} disabled={!hasEdit(tier) || missingIdentity}>
                  Save plan
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
