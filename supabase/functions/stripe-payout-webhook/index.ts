import { createServiceClient } from '../_shared/billing.ts';

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
  const supabase = createServiceClient();

  try {
    const { data: whSecretData, error: whSecretError } = await supabase
      .from('platform_api_keys')
      .select('key_value')
      .eq('key_name', 'STRIPE_WEBHOOK_SECRET')
      .maybeSingle();
    if (whSecretError) throw whSecretError;

    const webhookSecret = whSecretData?.key_value?.trim();
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');

    const sig = parseStripeSignature(req.headers.get('stripe-signature'));
    if (!sig?.t || !sig?.v1) return new Response('Missing Stripe signature', { status: 400 });

    const signedPayload = `${sig.t}.${body}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload)));
    const expected = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (!secureCompare(expected, sig.v1)) return new Response('Invalid Stripe signature', { status: 400 });

    const event = JSON.parse(body);
    const eventId = event?.id as string | undefined;
    const eventType = event?.type as string | undefined;

    if (!eventId || !eventType) return new Response('Invalid Stripe event payload', { status: 400 });

    const supported = new Set([
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
    ]);

    if (!supported.has(eventType)) {
      return new Response(JSON.stringify({ ignored: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: existingEvent, error: existingEventError } = await (supabase as any)
      .from('stripe_webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existingEventError) throw existingEventError;
    if (existingEvent) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const session = event?.data?.object;
    const payoutPeriodId = session?.metadata?.payout_period_id as string | undefined;
    const venueId = session?.metadata?.venue_id as string | undefined;
    const paymentType = session?.metadata?.payment_type as string | undefined;
    if (!payoutPeriodId || !venueId || paymentType !== 'monthly_payout') {
      throw new Error('Missing required monthly payout metadata');
    }

    const paymentRef = (session?.payment_intent as string | undefined) ?? (session?.id as string | undefined) ?? null;

    if (eventType === 'checkout.session.async_payment_failed') {
      const { error: failError } = await (supabase as any)
        .from('payments')
        .update({
          status: 'failed',
          external_payment_id: paymentRef,
          updated_at: new Date().toISOString(),
        })
        .eq('payout_period_id', payoutPeriodId)
        .eq('venue_id', venueId)
        .in('status', ['pending', 'failed']);
      if (failError) throw failError;

      const { error: eventInsertError } = await (supabase as any)
        .from('stripe_webhook_events')
        .insert({
          event_id: eventId,
          event_type: eventType,
          status: 'processed',
          processed_at: new Date().toISOString(),
        });
      if (eventInsertError) throw eventInsertError;

      return new Response(JSON.stringify({ received: true, status: 'failed_recorded' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: period, error: periodError } = await (supabase as any)
      .from('payout_periods')
      .select('id, status')
      .eq('id', payoutPeriodId)
      .eq('venue_id', venueId)
      .maybeSingle();
    if (periodError) throw periodError;
    if (!period) throw new Error('Payout period not found for webhook metadata');

    if (period.status === 'paid') {
      const { error: eventInsertError } = await (supabase as any)
        .from('stripe_webhook_events')
        .insert({
          event_id: eventId,
          event_type: eventType,
          status: 'already_applied',
          processed_at: new Date().toISOString(),
        });
      if (eventInsertError) throw eventInsertError;

      return new Response(JSON.stringify({ received: true, status: 'already_paid' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: applyResult, error: applyError } = await (supabase as any)
      .rpc('apply_monthly_payout_payment', {
        p_period_id: payoutPeriodId,
        p_external_payment_id: paymentRef,
      });
    if (applyError) throw applyError;

    const { error: eventInsertError } = await (supabase as any)
      .from('stripe_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        status: applyResult === 'already_paid' ? 'already_applied' : 'processed',
        processed_at: new Date().toISOString(),
      });
    if (eventInsertError) throw eventInsertError;

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('stripe-payout-webhook error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.toLowerCase().includes('signature') || message.toLowerCase().includes('invalid stripe event payload')
      ? 400
      : 500;
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
