// No external crypto imports needed — uses Web Crypto API
import { createServiceClient, getStripeSecretKey, syncVenueEntitlements } from '../_shared/billing.ts';

function secureCompare(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseStripeSignature(header: string | null) {
  if (!header) return null;
  const parts = header.split(',').map((p) => p.trim());
  const map = new Map(parts.map((p) => p.split('=') as [string, string]));
  return { t: map.get('t') ?? '', v1: map.get('v1') ?? '' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.text();

  try {
    const supabase = createServiceClient();

    const { data: whSecretData } = await supabase
      .from('platform_api_keys')
      .select('key_value')
      .eq('key_name', 'STRIPE_WEBHOOK_SECRET')
      .maybeSingle();

    const webhookSecret = whSecretData?.key_value?.trim();
    if (webhookSecret) {
      const sig = parseStripeSignature(req.headers.get('stripe-signature'));
      if (!sig?.t || !sig?.v1) throw new Error('Missing Stripe signature');
      const signedPayload = `${sig.t}.${body}`;
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload)));
      const expected = Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      if (!secureCompare(expected, sig.v1)) throw new Error('Invalid Stripe signature');
    }

    const event = JSON.parse(body);
    const type = event?.type as string;
    const obj = event?.data?.object;
    const upsertFromSubscription = async (subscription: any, overrideTierId?: string | null, venueIdOverride?: string | null) => {
      const venueId = venueIdOverride ?? subscription?.metadata?.venue_id;
      if (!venueId) return;
      const tierId = overrideTierId ?? subscription?.metadata?.subscription_tier_id ?? null;

      await supabase.from('venue_subscriptions').upsert({
        venue_id: venueId,
        stripe_customer_id: subscription.customer ?? null,
        stripe_subscription_id: subscription.id ?? null,
        subscription_tier_id: tierId,
        status: subscription.status ?? 'inactive',
        current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
        current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'venue_id' });

      await syncVenueEntitlements(venueId);
    };

    if (type === 'checkout.session.completed') {
      const paymentType = obj?.metadata?.payment_type;
      if (paymentType === 'monthly_payout') {
        // Monthly payout checkout events are handled by the dedicated
        // stripe-payout-webhook function (idempotent + payout-specific updates).
      } else {
        const venueId = obj?.metadata?.venue_id;
        const tierId = obj?.metadata?.subscription_tier_id;
        if (venueId && obj?.subscription) {
          const stripeKey = await getStripeSecretKey();
          const res = await fetch(`https://api.stripe.com/v1/subscriptions/${obj.subscription}`, { headers: { Authorization: `Bearer ${stripeKey}` } });
          const sub = await res.json();
          if (res.ok) await upsertFromSubscription(sub, tierId, venueId);
        }
      }
    }

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      await upsertFromSubscription(obj);

      const venueId = obj?.metadata?.venue_id;
      if (venueId) {
        const { data: existing } = await supabase.from('venue_subscriptions').select('pending_tier_id').eq('venue_id', venueId).maybeSingle();
        const currentTierFromStripe = obj?.metadata?.subscription_tier_id ?? null;
        if (existing?.pending_tier_id && currentTierFromStripe === existing.pending_tier_id) {
          await supabase.from('venue_subscriptions').update({
            pending_tier_id: null,
            pending_change_type: 'none',
            pending_change_effective_at: null,
          }).eq('venue_id', venueId);
        }
      }
    }

    if (type === 'customer.subscription.deleted') {
      const venueId = obj?.metadata?.venue_id;
      if (venueId) {
        await supabase.from('venue_subscriptions').upsert({ venue_id: venueId, status: 'inactive', subscription_tier_id: null, stripe_subscription_id: null, pending_tier_id: null, pending_change_type: 'none', pending_change_effective_at: null, last_synced_at: new Date().toISOString() }, { onConflict: 'venue_id' });
        await syncVenueEntitlements(venueId);
      }
    }

    if (type === 'invoice.payment_failed') {
      const subId = obj?.subscription;
      if (subId) {
        await supabase.from('venue_subscriptions').update({ status: 'past_due', last_synced_at: new Date().toISOString() }).eq('stripe_subscription_id', subId);
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('stripe-webhook error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
});
