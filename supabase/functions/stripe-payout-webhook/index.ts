import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.text();
    // NOTE: Signature verification should be added with Stripe SDK in production.
    // This handler assumes ingress verifies the webhook signature.

    const event = JSON.parse(body);
    if (event.type !== "payment_intent.succeeded") {
      return new Response("Ignored", { status: 200 });
    }

    const intent = event.data?.object;
    const payoutPeriodId = intent?.metadata?.payout_period_id;
    if (!payoutPeriodId) return new Response("Missing payout period metadata", { status: 400 });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: commissions } = await (supabaseAdmin as any)
      .from("commissions")
      .select("id, locked_commission_value, locked_platform_fee, referrers(stripe_connect_account_id)")
      .eq("payout_period_id", payoutPeriodId)
      .neq("status", "paid");

    const grouped = new Map<string, number>();
    for (const row of commissions ?? []) {
      const destination = row?.referrers?.stripe_connect_account_id;
      if (!destination) continue;
      const amount = Math.max(Number(row.locked_commission_value || 0) - Number(row.locked_platform_fee || 0), 0);
      grouped.set(destination, (grouped.get(destination) || 0) + amount);
    }

    for (const [destination, amount] of grouped.entries()) {
      const transferPayload = new URLSearchParams({
        amount: String(Math.round(amount * 100)),
        currency: "gbp",
        destination,
        transfer_group: intent.metadata?.transfer_group || `payout_period_${payoutPeriodId}`,
      });

      await fetch("https://api.stripe.com/v1/transfers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: transferPayload,
      });
    }

    await supabaseAdmin.rpc("mark_payout_period_paid", {
      p_period_id: payoutPeriodId,
      p_payment_intent_id: intent.id,
    });

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }
});
