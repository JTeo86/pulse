import { assertVenueOwner, corsHeaders, createServiceClient, getStripeSecretKey, getUserIdFromJwt } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const userId = await getUserIdFromJwt(req.headers.get('Authorization'));
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { venue_id } = await req.json();
    await assertVenueOwner(venue_id, userId);

    const supabase = createServiceClient();
    const { data: sub } = await supabase.from('venue_subscriptions').select('stripe_customer_id').eq('venue_id', venue_id).maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error('No billing customer found for this venue');

    const stripeKey = await getStripeSecretKey();
    const appUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? 'http://localhost:3000';

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: sub.stripe_customer_id,
        return_url: `${appUrl}/settings/billing`,
      }),
    });

    const portal = await portalRes.json();
    if (!portalRes.ok) throw new Error(portal?.error?.message ?? 'Stripe portal error');

    return new Response(JSON.stringify({ url: portal.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
