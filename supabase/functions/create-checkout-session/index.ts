import { corsHeaders, createServiceClient, getStripeSecretKey, getUserIdFromJwt, assertVenueOwner } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const userId = await getUserIdFromJwt(req.headers.get('Authorization'));
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { venue_id, subscription_tier_id } = await req.json();
    if (!venue_id || !subscription_tier_id) throw new Error('venue_id and subscription_tier_id are required');

    await assertVenueOwner(venue_id, userId);

    const supabase = createServiceClient();
    const [{ data: tier }, { data: venue }, { data: subRow }] = await Promise.all([
      supabase.from('subscription_tiers').select('id, stripe_price_id_monthly').eq('id', subscription_tier_id).maybeSingle(),
      supabase.from('venues').select('name').eq('id', venue_id).maybeSingle(),
      supabase.from('venue_subscriptions').select('stripe_customer_id').eq('venue_id', venue_id).maybeSingle(),
    ]);

    if (!tier?.stripe_price_id_monthly) throw new Error('Selected tier is not configured for Stripe billing');

    const stripeKey = await getStripeSecretKey();

    let customerId = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name: venue?.name ?? 'Pulse Venue',
          'metadata[venue_id]': venue_id,
        }),
      });
      const customer = await customerRes.json();
      if (!customerRes.ok) throw new Error(customer?.error?.message ?? 'Stripe customer error');
      customerId = customer.id;

      await supabase.from('venue_subscriptions').upsert({ venue_id, stripe_customer_id: customerId }, { onConflict: 'venue_id' });
    }

    const appUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? 'http://localhost:3000';
    const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        customer: customerId,
        success_url: `${appUrl}/settings/billing?checkout=success`,
        cancel_url: `${appUrl}/settings/billing?checkout=cancelled`,
        'line_items[0][price]': tier.stripe_price_id_monthly,
        'line_items[0][quantity]': '1',
        'subscription_data[metadata][venue_id]': venue_id,
        'subscription_data[metadata][subscription_tier_id]': subscription_tier_id,
        'metadata[venue_id]': venue_id,
        'metadata[subscription_tier_id]': subscription_tier_id,
      }),
    });

    const checkout = await checkoutRes.json();
    if (!checkoutRes.ok) throw new Error(checkout?.error?.message ?? 'Stripe checkout error');

    return new Response(JSON.stringify({ url: checkout.url, session_id: checkout.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
