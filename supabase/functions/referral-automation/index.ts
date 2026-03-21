import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PULSE_FEE_RATE = 0.05; // 5% platform fee

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth: require user JWT + venue admin (financial operations) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (!authHeader.startsWith("Bearer ") || !token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string;

    // Allow service role key for internal/cron calls
    if (token === serviceKey) {
      userId = "service-role";
    } else {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { venue_id, action } = await req.json();

    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify venue membership (skip for service role)
    if (userId !== "service-role") {
      // For financial actions, require venue admin (owner)
      const isFinancialAction = action === "calculate_commissions" || action === "generate_payout_batch";

      if (isFinancialAction) {
        const { data: isAdmin } = await supabaseAdmin.rpc("is_venue_admin", {
          check_venue_id: venue_id,
          check_user_id: userId,
        });
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Forbidden: venue admin required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { data: isMember } = await supabaseAdmin.rpc("is_venue_member", {
          check_venue_id: venue_id,
          check_user_id: userId,
        });
        if (!isMember) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Action: calculate_commissions
    if (action === "calculate_commissions") {
      const { data: bookings } = await supabaseAdmin
        .from("referral_bookings")
        .select("id, verified_spend, offer_id, commission_status")
        .eq("venue_id", venue_id)
        .eq("spend_verified", true)
        .is("commission_amount", null);

      if (!bookings?.length) {
        return new Response(JSON.stringify({ message: "No bookings to process", count: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const offerIds = [...new Set(bookings.filter(b => b.offer_id).map(b => b.offer_id))];
      const { data: offers } = await supabaseAdmin
        .from("venue_offers")
        .select("id, commission_type, commission_value")
        .in("id", offerIds);

      const offerMap = new Map((offers || []).map(o => [o.id, o]));
      let processed = 0;

      for (const booking of bookings) {
        const offer = offerMap.get(booking.offer_id);
        if (!offer || !booking.verified_spend) continue;

        const commission = offer.commission_type === "percentage"
          ? (Number(booking.verified_spend) * Number(offer.commission_value)) / 100
          : Number(offer.commission_value);

        await supabaseAdmin
          .from("referral_bookings")
          .update({ commission_amount: commission, commission_status: "pending" })
          .eq("id", booking.id);

        processed++;
      }

      await supabaseAdmin.from("system_events").insert({
        venue_id,
        event_type: "commissions_calculated",
        event_payload: { count: processed },
      });

      return new Response(JSON.stringify({ success: true, processed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: generate_payout_batch
    if (action === "generate_payout_batch") {
      const now = new Date();
      const batchMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const { data: existing } = await supabaseAdmin
        .from("payout_batches")
        .select("id")
        .eq("venue_id", venue_id)
        .eq("batch_month", batchMonth)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ message: "Batch already exists", batch_id: existing.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: approved } = await supabaseAdmin
        .from("referral_bookings")
        .select("id, referrer_id, commission_amount, venue_id")
        .eq("venue_id", venue_id)
        .eq("commission_status", "approved")
        .eq("spend_verified", true)
        .not("commission_amount", "is", null);

      if (!approved?.length) {
        return new Response(JSON.stringify({ message: "No approved commissions for batch" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const totalCommission = approved.reduce((s, b) => s + (Number(b.commission_amount) || 0), 0);
      const pulseFee = totalCommission * PULSE_FEE_RATE;
      const netPayout = totalCommission - pulseFee;

      const { data: batch, error: batchErr } = await supabaseAdmin
        .from("payout_batches")
        .insert({
          venue_id,
          batch_month: batchMonth,
          status: "pending_approval",
          total_commission: totalCommission,
          pulse_fee: pulseFee,
          net_payout: netPayout,
        })
        .select("id")
        .single();

      if (batchErr) throw batchErr;

      for (const booking of approved) {
        const commission = Number(booking.commission_amount) || 0;
        const fee = commission * PULSE_FEE_RATE;
        await supabaseAdmin.from("payout_items").insert({
          batch_id: batch.id,
          venue_id,
          referrer_id: booking.referrer_id,
          referral_booking_id: booking.id,
          commission_amount: commission,
          pulse_fee: fee,
          net_amount: commission - fee,
          status: "pending",
        });
      }

      await supabaseAdmin.from("system_events").insert({
        venue_id,
        event_type: "payout_batch_created",
        event_payload: { batch_id: batch.id, batch_month: batchMonth, total: totalCommission },
      });

      await supabaseAdmin.from("referral_audit_events").insert({
        venue_id,
        event_type: "payout_batch_created",
        event_payload: { batch_id: batch.id, items: approved.length, total: totalCommission },
      });

      return new Response(JSON.stringify({ success: true, batch_id: batch.id, items: approved.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: generate_referral_actions
    if (action === "generate_referral_actions") {
      const actions: any[] = [];

      const { count: pendingVerify } = await supabaseAdmin
        .from("referral_bookings")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venue_id)
        .eq("spend_verified", false)
        .in("booking_status", ["attended", "confirmed"]);

      if (pendingVerify && pendingVerify > 0) {
        actions.push({
          venue_id,
          action_type: "referral_verify_bills",
          priority: "high",
          title: `Verify ${pendingVerify} referral bill${pendingVerify > 1 ? "s" : ""}`,
          description: "Partner referrals are awaiting spend verification before commissions can be calculated.",
          cta_label: "Verify Now",
          cta_route: "/growth/referrals",
          status: "open",
        });
      }

      const { count: pendingPayout } = await supabaseAdmin
        .from("payout_batches")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venue_id)
        .eq("status", "pending_approval");

      if (pendingPayout && pendingPayout > 0) {
        actions.push({
          venue_id,
          action_type: "referral_approve_payout",
          priority: "medium",
          title: "Approve payout batch",
          description: "A payout batch is ready for your review and approval.",
          cta_label: "Review Payouts",
          cta_route: "/growth/payouts",
          status: "open",
        });
      }

      const { count: pendingPartners } = await supabaseAdmin
        .from("referrers")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venue_id)
        .eq("status", "invited");

      if (pendingPartners && pendingPartners > 0) {
        actions.push({
          venue_id,
          action_type: "referral_partner_pending",
          priority: "low",
          title: `Review ${pendingPartners} new partner invite${pendingPartners > 1 ? "s" : ""}`,
          description: "Partner invitations are waiting for activation.",
          cta_label: "View Partners",
          cta_route: "/growth/partners",
          status: "open",
        });
      }

      const { count: pendingUGC } = await supabaseAdmin
        .from("guest_submissions")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venue_id)
        .eq("status", "pending");

      if (pendingUGC && pendingUGC > 0) {
        actions.push({
          venue_id,
          action_type: "guest_ugc_review",
          priority: "low",
          title: `${pendingUGC} guest photo${pendingUGC > 1 ? "s" : ""} to review`,
          description: "Guest-submitted photos are waiting for your approval.",
          cta_label: "Review Photos",
          cta_route: "/content/library",
          status: "open",
        });
      }

      for (const action of actions) {
        await supabaseAdmin.from("action_feed_items").upsert(action, {
          onConflict: "venue_id,action_type",
          ignoreDuplicates: false,
        });
      }

      const types = ["referral_verify_bills", "referral_approve_payout", "referral_partner_pending", "guest_ugc_review"];
      const activeTypes = actions.map(a => a.action_type);
      const toClean = types.filter(t => !activeTypes.includes(t));

      for (const t of toClean) {
        await supabaseAdmin
          .from("action_feed_items")
          .delete()
          .eq("venue_id", venue_id)
          .eq("action_type", t)
          .eq("status", "open");
      }

      return new Response(JSON.stringify({ success: true, actions_generated: actions.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: calculate_commissions, generate_payout_batch, generate_referral_actions" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("referral-automation error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
