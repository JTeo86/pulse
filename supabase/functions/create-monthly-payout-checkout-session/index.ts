import { assertVenueOwner, corsHeaders, createServiceClient, getStripeSecretKey, getUserIdFromJwt } from '../_shared/billing.ts';

const toCents = (amount: number) => Math.round(Number(amount || 0) * 100);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const userId = await getUserIdFromJwt(req.headers.get('Authorization'));
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { venue_id, payout_period_id } = await req.json();
    if (!venue_id || !payout_period_id) throw new Error('venue_id and payout_period_id are required');

    await assertVenueOwner(venue_id, userId);

    const supabase = createServiceClient();
    const { data: period, error: periodError } = await (supabase as any)
      .from('payout_periods')
      .select('id, venue_id, status, month, total_commission, stripe_payment_id')
      .eq('id', payout_period_id)
      .eq('venue_id', venue_id)
      .maybeSingle();

    if (periodError) throw periodError;
    if (!period) throw new Error('Payout period not found');
    if (period.status !== 'locked') throw new Error('Only locked payout periods can be paid');
    if (period.stripe_payment_id) throw new Error('This payout period is already paid');

    const amount = Number(period.total_commission || 0);
    if (amount <= 0) throw new Error('Payout period total must be greater than 0');

    const stripeKey = await getStripeSecretKey();
    const appUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? 'http://localhost:3000';

    const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'payment',
        success_url: `${appUrl}/growth/payouts?payment=success&payout_period_id=${payout_period_id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/growth/payouts?payment=cancelled&payout_period_id=${payout_period_id}`,
        'line_items[0][price_data][currency]': 'gbp',
        'line_items[0][price_data][product_data][name]': `Monthly payout ${new Date(period.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
        'line_items[0][price_data][unit_amount]': String(toCents(amount)),
        'line_items[0][quantity]': '1',
        'metadata[payment_type]': 'monthly_payout',
        'metadata[venue_id]': venue_id,
        'metadata[payout_period_id]': payout_period_id,
      }),
    });

    const checkout = await checkoutRes.json();
    if (!checkoutRes.ok) throw new Error(checkout?.error?.message ?? 'Stripe checkout error');

    return new Response(JSON.stringify({ url: checkout.url, session_id: checkout.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
