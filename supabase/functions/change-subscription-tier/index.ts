import { assertVenueOwner, corsHeaders, createServiceClient, getStripeSecretKey, getUserIdFromJwt, syncVenueEntitlements } from '../_shared/billing.ts';

function toIso(ts: number | null | undefined) {
  return ts ? new Date(ts * 1000).toISOString() : null;
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
    const [{ data: sub }, { data: currentTier }, { data: targetTier }] = await Promise.all([
      supabase.from('venue_subscriptions').select('*').eq('venue_id', venue_id).maybeSingle(),
      supabase.from('subscription_tiers').select('*').eq('id', (await supabase.from('venue_subscriptions').select('subscription_tier_id').eq('venue_id', venue_id).maybeSingle()).data?.subscription_tier_id ?? '').maybeSingle(),
      supabase.from('subscription_tiers').select('*').eq('id', target_tier_id).maybeSingle(),
    ]);

    if (!sub?.stripe_subscription_id) throw new Error('No active Stripe subscription found for this venue');
    if (!targetTier?.stripe_price_id_monthly) throw new Error('Target tier does not have a Stripe monthly price');

    const currentSort = currentTier?.sort_order ?? 0;
    const targetSort = targetTier.sort_order ?? 0;
    const isUpgrade = targetSort > currentSort;

    const stripeKey = await getStripeSecretKey();

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
