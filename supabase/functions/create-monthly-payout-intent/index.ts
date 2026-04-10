import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toCents = (amount: number) => Math.round(Number(amount || 0) * 100);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { venue_id, payout_period_id } = await req.json();

    const { data: isAdmin } = await supabaseAdmin.rpc("is_venue_admin", {
      check_venue_id: venue_id,
      check_user_id: userData.user.id,
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: period, error: periodError } = await (supabaseAdmin as any)
      .from("payout_periods")
      .select("id, venue_id, status, month, total_commission, total_platform_fee")
      .eq("id", payout_period_id)
      .eq("venue_id", venue_id)
      .single();
    if (periodError || !period) throw periodError ?? new Error("Payout period not found");

    if (!["final", "overdue"].includes(period.status)) {
      return new Response(JSON.stringify({ error: "Payout period must be final before payment." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: commissions, error: commissionError } = await (supabaseAdmin as any)
      .from("commissions")
      .select("id, partner_id, locked_commission_value, locked_platform_fee, referrers(stripe_connect_account_id)")
      .eq("payout_period_id", payout_period_id)
      .neq("status", "paid");
    if (commissionError) throw commissionError;

    const transferBreakdown: Record<string, number> = {};
    for (const item of commissions ?? []) {
      const accountId = item?.referrers?.stripe_connect_account_id;
      if (!accountId) continue;
      const net = Number(item.locked_commission_value || 0) - Number(item.locked_platform_fee || 0);
      transferBreakdown[accountId] = (transferBreakdown[accountId] || 0) + Math.max(net, 0);
    }

    const gross = Number(period.total_commission || 0);
    const fee = Number(period.total_platform_fee || 0);

    const payload = new URLSearchParams({
      amount: String(toCents(gross)),
      currency: "gbp",
      capture_method: "automatic",
      confirmation_method: "automatic",
      "automatic_payment_methods[enabled]": "true",
      "metadata[venue_id]": venue_id,
      "metadata[payout_period_id]": payout_period_id,
      "metadata[transfer_group]": `payout_period_${payout_period_id}`,
      "metadata[platform_fee]": String(fee),
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });

    const stripeBody = await stripeRes.json();
    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: stripeBody?.error?.message ?? "Stripe error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await (supabaseAdmin as any)
      .from("payout_periods")
      .update({ payment_intent_id: stripeBody.id })
      .eq("id", payout_period_id);

    return new Response(JSON.stringify({
      payment_intent_id: stripeBody.id,
      client_secret: stripeBody.client_secret,
      gross_amount: gross,
      platform_fee: fee,
      transfer_breakdown: transferBreakdown,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
