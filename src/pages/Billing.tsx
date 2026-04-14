import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CreditCard, Lock, Users } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { isFunctionNotDeployedError, isMissingBillingSchemaError } from '@/lib/billing-readiness';

const TIER_USAGE_GUIDE: Record<string, { imagesLabel: string; storageLabel: string; usersLabel: string }> = {
  starter: { imagesLabel: '~60 images', storageLabel: '2 GB', usersLabel: '2 users' },
  growth: { imagesLabel: '~200 images', storageLabel: '10 GB', usersLabel: '5 users' },
  pro: { imagesLabel: '~500 images', storageLabel: '25 GB', usersLabel: '10 users' },
};

export default function BillingPage() {
  const { currentVenue, isOwner } = useVenue();
  const { toast } = useToast();

  const { data, refetch } = useQuery({
    queryKey: ['billing-page', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      const venueId = currentVenue!.id;
      const month = new Date().toISOString().slice(0, 7);
      const [tiersRes, subRes, entitlementRes, usageRes, walletRes, membersRes, invitesRes] = await Promise.all([
        supabase.from('subscription_tiers').select('*').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('venue_subscriptions').select('*').eq('venue_id', venueId).maybeSingle(),
        supabase.from('venue_entitlements').select('*').eq('venue_id', venueId).maybeSingle(),
        supabase.from('editor_usage').select('pro_photo_used').eq('venue_id', venueId).eq('month', month).maybeSingle(),
        supabase.from('credit_wallets').select('balance').eq('venue_id', venueId).eq('credit_type', 'video').maybeSingle(),
        supabase.from('venue_members').select('id, user_id').eq('venue_id', venueId),
        supabase.from('venue_invites').select('id').eq('venue_id', venueId).is('accepted_at', null),
      ]);
      const schemaMissing = [tiersRes.error, subRes.error, entitlementRes.error, walletRes.error]
        .some((err) => err && isMissingBillingSchemaError(err));

      if (usageRes.error) throw usageRes.error;
      if (membersRes.error) throw membersRes.error;
      if (invitesRes.error) throw invitesRes.error;
      if (walletRes.error && !isMissingBillingSchemaError(walletRes.error)) throw walletRes.error;

      return {
        schemaMissing,
        tiers: schemaMissing ? [] : (tiersRes.data ?? []),
        sub: schemaMissing ? null : subRes.data,
        entitlement: schemaMissing ? null : entitlementRes.data,
        usage: usageRes.data,
        wallet: walletRes.data,
        memberCount: membersRes.data?.length ?? 0,
        ownerInMembers: Boolean(
          currentVenue?.owner_user_id &&
          (membersRes.data ?? []).some((member) => member.user_id === currentVenue.owner_user_id),
        ),
        pendingInvites: invitesRes.data?.length ?? 0,
      };
    },
  });

  const seatUsed = useMemo(() => {
    if (!data || !currentVenue) return 0;
    const ownerAlreadyCounted = data.ownerInMembers;
    return data.memberCount + (ownerAlreadyCounted ? 0 : 1) + data.pendingInvites;
  }, [data, currentVenue]);

  const handleCheckout = async (tierId: string) => {
    if (!currentVenue) return;
    const shouldContinue = window.confirm('Continue to secure checkout for this plan?');
    if (!shouldContinue) return;
    const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: { venue_id: currentVenue.id, subscription_tier_id: tierId } });
    if (isFunctionNotDeployedError(error)) {
      return toast({ variant: 'destructive', title: 'Billing setup incomplete', description: 'Checkout service is not deployed yet in this environment.' });
    }
    if (error) return toast({ variant: 'destructive', title: 'Checkout failed', description: error.message });
    window.location.href = data.url;
  };

  const handleTierChange = async (tierId: string) => {
    if (!currentVenue) return;
    const shouldContinue = window.confirm('Confirm plan change? You can review billing details before final payment changes apply.');
    if (!shouldContinue) return;
    const { error } = await supabase.functions.invoke('change-subscription-tier', { body: { venue_id: currentVenue.id, target_tier_id: tierId } });
    if (isFunctionNotDeployedError(error)) {
      return toast({ variant: 'destructive', title: 'Billing setup incomplete', description: 'Plan change service is not deployed yet in this environment.' });
    }
    if (error) {
      toast({ variant: 'destructive', title: 'Plan change failed', description: error.message });
      return;
    }
    toast({ title: 'Plan update requested', description: 'Your subscription change was saved.' });
    refetch();
  };

  const openPortal = async () => {
    if (!currentVenue) return;
    const { data, error } = await supabase.functions.invoke('create-customer-portal-session', { body: { venue_id: currentVenue.id } });
    if (isFunctionNotDeployedError(error)) {
      return toast({ variant: 'destructive', title: 'Billing setup incomplete', description: 'Customer portal service is not deployed yet in this environment.' });
    }
    if (error) return toast({ variant: 'destructive', title: 'Unable to open billing portal', description: error.message });
    window.location.href = data.url;
  };

  if (!isOwner) {
    return (
      <div className="max-w-xl">
        <PageHeader title="Billing" description="Owner-only area" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Owner access required</CardTitle>
            <CardDescription>Only the venue owner can manage subscription tiers and billing.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentTierId = data?.sub?.subscription_tier_id;
  const missingSchema = Boolean(data?.schemaMissing);
  const billingActionsDisabled = missingSchema;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="Billing" description="Manage your plan, usage, and entitlements" />
      {missingSchema && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Billing setup pending</CardTitle>
            <CardDescription>
              Billing tables are not available in this environment yet. Apply the latest billing migration and deploy billing edge functions.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Status: <span className="font-medium capitalize">{data?.sub?.status ?? 'inactive'}</span></p>
            <p>Renews: {data?.sub?.current_period_end ? new Date(data.sub.current_period_end).toLocaleDateString() : '—'}</p>
            {data?.sub?.pending_change_type === 'downgrade' && <p className="text-warning">Downgrade scheduled for {data.sub.pending_change_effective_at ? new Date(data.sub.pending_change_effective_at).toLocaleDateString() : 'period end'}.</p>}
            <p>Image quota: {data?.entitlement?.monthly_image_quota ?? 0}</p>
            <p>Storage quota: {data?.entitlement?.monthly_storage_mb ?? 0} MB</p>
            <p>Max users: {data?.entitlement?.max_users_per_venue ?? 1}</p>
            <p>Marketplace: {data?.entitlement?.marketplace_access_enabled ? 'Enabled' : 'Disabled'}</p>
            <p>Video credits: {data?.wallet?.balance ?? 0}</p>
            <Button variant="outline" onClick={openPortal} disabled={billingActionsDisabled}>
              Manage billing
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Images used this month: {data?.usage?.pro_photo_used ?? 0}</p>
            <p>Images remaining: {Math.max((data?.entitlement?.monthly_image_quota ?? 0) - (data?.usage?.pro_photo_used ?? 0), 0)}</p>
            <p>Storage: {currentVenue?.storage_used_mb ?? 0} / {data?.entitlement?.monthly_storage_mb ?? 0} MB</p>
            <p className="flex items-center gap-2"><Users className="w-4 h-4" /> Seats used: {seatUsed} / {data?.entitlement?.max_users_per_venue ?? 1}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {data?.tiers.map((tier: any) => {
          const isCurrent = currentTierId === tier.id;
          const usageGuide = TIER_USAGE_GUIDE[(tier.slug || '').toLowerCase()];
          return (
            <Card key={tier.id} className={isCurrent ? 'border-accent' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <CardDescription>{tier.description || '—'}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>Stripe mapping: {tier.stripe_price_id_monthly || 'Not configured'}</p>
                <p>Image limit: {usageGuide?.imagesLabel ?? `~${tier.monthly_image_quota} images`} ({tier.monthly_image_quota}/mo)</p>
                <p>Storage limit: {usageGuide?.storageLabel ?? `${tier.monthly_storage_mb} MB`} ({tier.monthly_storage_mb} MB)</p>
                <p>User limit: {usageGuide?.usersLabel ?? `${tier.max_users_per_venue} users`}</p>
                <p>Feature access: {tier.marketplace_access_enabled ? 'Marketplace enabled' : 'Marketplace not included'}</p>
                <p>Video credits: {tier.video_payg_enabled ? 'PAYG eligible' : 'Not eligible'}</p>
                {(tier.feature_summary_json || []).map((f: string) => <p key={f} className="flex items-center gap-2"><Check className="w-3 h-3" />{f}</p>)}
                {!isCurrent && (
                  <div className="pt-2 flex gap-2">
                    <Button
                      className="w-full"
                      onClick={() => currentTierId ? handleTierChange(tier.id) : handleCheckout(tier.id)}
                      disabled={billingActionsDisabled}
                    >
                      {currentTierId ? 'Change tier' : 'Upgrade now'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Video credits</CardTitle><CardDescription>Video credit top-ups are intentionally paused while usage billing validation is finalized.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" disabled>Top-ups paused</Button>
          <p className="text-xs text-muted-foreground">Your current video credit balance remains visible above. Purchase actions will re-open after rollout validation.</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
