import { assertVenueOwner, corsHeaders, createServiceClient, getStripeSecretKey, getUserIdFromJwt } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const userId = await getUserIdFromJwt(req.headers.get('Authorization'));
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { venue_id, payout_period_id, session_id } = await req.json();
    if (!venue_id || !payout_period_id || !session_id) throw new Error('venue_id, payout_period_id, and session_id are required');

    await assertVenueOwner(venue_id, userId);

    const stripeKey = await getStripeSecretKey();
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}?expand[]=payment_intent`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(session?.error?.message ?? 'Stripe session lookup failed');

    if (session?.payment_status !== 'paid') throw new Error('Payment is not complete yet');
    if (session?.metadata?.payment_type !== 'monthly_payout') throw new Error('Invalid payment type');
    if (session?.metadata?.payout_period_id !== payout_period_id) throw new Error('Payout period mismatch');

    const paymentId = session?.payment_intent?.id ?? session?.payment_intent ?? session?.id;

    const supabase = createServiceClient();
    const { error: updatePeriodError } = await (supabase as any)
      .from('payout_periods')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_id: paymentId,
      })
      .eq('id', payout_period_id)
      .eq('venue_id', venue_id)
      .eq('status', 'locked');
    if (updatePeriodError) throw updatePeriodError;

    const { error: updateItemsError } = await (supabase as any)
      .from('payout_items')
      .update({ status: 'paid' })
      .eq('payout_period_id', payout_period_id)
      .neq('status', 'paid');
    if (updateItemsError) throw updateItemsError;

    return new Response(JSON.stringify({ success: true, stripe_payment_id: paymentId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
