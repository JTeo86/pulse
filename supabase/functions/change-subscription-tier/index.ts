import { assertVenueOwner, corsHeaders, createServiceClient, getStripeSecretKey, getUserIdFromJwt, syncVenueEntitlements } from '../_shared/billing.ts';

function toIso(ts: number | null | undefined) {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

type Tier = {
  id: string;
  slug: string | null;
  sort_order: number | null;
  max_users_per_venue: number | null;
  monthly_image_quota: number | null;
  monthly_storage_mb: number | null;
  marketplace_access_enabled: boolean | null;
  video_payg_enabled: boolean | null;
  stripe_price_id_monthly: string | null;
};

type StripePriceSnapshot = {
  id: string;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  active: boolean;
};

async function readStripePriceSnapshot(priceId: string, stripeKey: string): Promise<StripePriceSnapshot | null> {
  const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Failed to fetch Stripe price ${priceId}`);

  return {
    id: String(data?.id ?? priceId),
    unitAmount: typeof data?.unit_amount === 'number' ? data.unit_amount : null,
    currency: typeof data?.currency === 'string' ? data.currency : null,
    interval: typeof data?.recurring?.interval === 'string' ? data.recurring.interval : null,
    active: Boolean(data?.active),
  };
}

function tierCommercialVector(tier: Tier): number[] {
  return [
    tier.max_users_per_venue ?? 0,
    tier.monthly_image_quota ?? 0,
    tier.monthly_storage_mb ?? 0,
    tier.marketplace_access_enabled ? 1 : 0,
    tier.video_payg_enabled ? 1 : 0,
  ];
}

function compareVectors(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function isUpgradeChange(currentTier: Tier | null, targetTier: Tier, stripeKey: string): Promise<boolean> {
  if (!currentTier) return true;

  if (currentTier.stripe_price_id_monthly && targetTier.stripe_price_id_monthly) {
    const [currentPrice, targetPrice] = await Promise.all([
      readStripePriceSnapshot(currentTier.stripe_price_id_monthly, stripeKey),
      readStripePriceSnapshot(targetTier.stripe_price_id_monthly, stripeKey),
    ]);

    const sameCurrency = currentPrice?.currency && targetPrice?.currency && currentPrice.currency === targetPrice.currency;
    const sameInterval = currentPrice?.interval === 'month' && targetPrice?.interval === 'month';
    if (sameCurrency && sameInterval && currentPrice?.unitAmount != null && targetPrice?.unitAmount != null && currentPrice.unitAmount !== targetPrice.unitAmount) {
      return targetPrice.unitAmount > currentPrice.unitAmount;
    }
  }

  const featureComparison = compareVectors(tierCommercialVector(currentTier), tierCommercialVector(targetTier));
  if (featureComparison !== 0) return featureComparison < 0;

  return (targetTier.sort_order ?? 0) > (currentTier.sort_order ?? 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const userId = await getUserIdFromJwt(req.headers.get('Authorization'));
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { venue_id, target_tier_id } = await req.json();
    if (!venue_id || !target_tier_id) throw new Error('venue_id and target_tier_id are required');
    await assertVenueOwner(venue_id, userId);

    const supabase = createServiceClient();
    const { data: sub } = await supabase.from('venue_subscriptions').select('*').eq('venue_id', venue_id).maybeSingle();
    const [{ data: currentTier }, { data: targetTier }] = await Promise.all([
      supabase.from('subscription_tiers').select('*').eq('id', sub?.subscription_tier_id ?? '').maybeSingle(),
      supabase.from('subscription_tiers').select('*').eq('id', target_tier_id).maybeSingle(),
    ]);

    if (!sub?.stripe_subscription_id) throw new Error('No active Stripe subscription found for this venue');
    if (!targetTier?.stripe_price_id_monthly) throw new Error('Target tier does not have a Stripe monthly price');

    const stripeKey = await getStripeSecretKey();
    const isUpgrade = await isUpgradeChange(currentTier as Tier | null, targetTier as Tier, stripeKey);

    if (isUpgrade) {
      const getSubRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const stripeSub = await getSubRes.json();
      if (!getSubRes.ok) throw new Error(stripeSub?.error?.message ?? 'Failed to read Stripe subscription');

      const itemId = stripeSub?.items?.data?.[0]?.id;
      if (!itemId) throw new Error('Unable to locate Stripe subscription item');

      const updateRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          proration_behavior: 'create_prorations',
          'items[0][id]': itemId,
          'items[0][price]': targetTier.stripe_price_id_monthly,
          'metadata[venue_id]': venue_id,
          'metadata[subscription_tier_id]': target_tier_id,
        }),
      });
      const updated = await updateRes.json();
      if (!updateRes.ok) throw new Error(updated?.error?.message ?? 'Failed to update Stripe subscription');

      await supabase.from('venue_subscriptions').upsert({
        venue_id,
        subscription_tier_id: target_tier_id,
        status: updated.status,
        current_period_start: toIso(updated.current_period_start),
        current_period_end: toIso(updated.current_period_end),
        cancel_at_period_end: false,
        pending_tier_id: null,
        pending_change_type: 'none',
        pending_change_effective_at: null,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'venue_id' });

      await syncVenueEntitlements(venue_id);
      return new Response(JSON.stringify({ ok: true, change_type: 'upgrade', effective: 'immediate' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const getSubRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const stripeSub = await getSubRes.json();
    if (!getSubRes.ok) throw new Error(stripeSub?.error?.message ?? 'Failed to read Stripe subscription');

    const currentPriceId = stripeSub?.items?.data?.[0]?.price?.id;
    if (!currentPriceId) throw new Error('Unable to determine current Stripe subscription price');

    const scheduleId = typeof stripeSub?.schedule === 'string' && stripeSub.schedule.length > 0
      ? stripeSub.schedule
      : null;

    let activeScheduleId = scheduleId;
    if (!activeScheduleId) {
      const scheduleRes = await fetch('https://api.stripe.com/v1/subscription_schedules', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from_subscription: sub.stripe_subscription_id,
        }),
      });
      const schedule = await scheduleRes.json();
      if (!scheduleRes.ok) throw new Error(schedule?.error?.message ?? 'Failed to create Stripe subscription schedule');
      activeScheduleId = schedule?.id;
    }

    if (!activeScheduleId) throw new Error('Unable to determine Stripe subscription schedule ID');

    const scheduleUpdateRes = await fetch(`https://api.stripe.com/v1/subscription_schedules/${activeScheduleId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        end_behavior: 'release',
        'phases[0][items][0][price]': currentPriceId,
        'phases[0][start_date]': String(stripeSub.current_period_start),
        'phases[0][end_date]': String(stripeSub.current_period_end),
        'phases[1][items][0][price]': targetTier.stripe_price_id_monthly,
        'phases[1][start_date]': String(stripeSub.current_period_end),
        'phases[1][metadata][venue_id]': venue_id,
        'phases[1][metadata][subscription_tier_id]': target_tier_id,
      }),
    });
    const updatedSchedule = await scheduleUpdateRes.json();
    if (!scheduleUpdateRes.ok) throw new Error(updatedSchedule?.error?.message ?? 'Failed to schedule Stripe downgrade');

    await supabase.from('venue_subscriptions').update({
      pending_tier_id: target_tier_id,
      pending_change_type: 'downgrade',
      pending_change_effective_at: sub.current_period_end,
    }).eq('venue_id', venue_id);

    return new Response(JSON.stringify({ ok: true, change_type: 'downgrade', effective: 'period_end' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
