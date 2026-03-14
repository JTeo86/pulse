import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { venue_id } = body;
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "Missing venue_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { data: isMember } = await supabaseAdmin.rpc("is_venue_member", {
      check_venue_id: venue_id,
      check_user_id: userId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a member" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather venue signals from the last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStart = weekAgo.toISOString().split("T")[0];
    const weekEnd = now.toISOString().split("T")[0];

    const [{ data: venue }, { data: plans }, { data: assets }, { data: revenueSignals }] =
      await Promise.all([
        supabaseAdmin.from("venues").select("name").eq("id", venue_id).single(),
        supabaseAdmin
          .from("venue_event_plans")
          .select("id, title, status, starts_at")
          .eq("venue_id", venue_id)
          .gte("created_at", weekAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(10),
        supabaseAdmin
          .from("content_assets")
          .select("id, asset_type, status")
          .eq("venue_id", venue_id)
          .gte("created_at", weekAgo.toISOString())
          .limit(20),
        supabaseAdmin
          .from("revenue_signals")
          .select("revenue_estimate, signal_type")
          .eq("venue_id", venue_id)
          .gte("created_at", weekAgo.toISOString())
          .limit(50),
      ]);

    const venueName = venue?.name || "Your Venue";
    const planCount = plans?.length || 0;
    const assetCount = assets?.length || 0;
    const signals = revenueSignals || [];
    const totalRevenue = signals.reduce((s: number, r: any) => s + (Number(r.revenue_estimate) || 0), 0);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Generate a short, actionable weekly revenue brief for ${venueName}.

This week's data:
- ${planCount} marketing plans created or updated
- ${assetCount} content assets produced
- ${signals.length} revenue signals tracked (£${totalRevenue.toFixed(0)} estimated)
- Active plans: ${(plans || []).map((p: any) => `"${p.title}" (${p.status})`).join(", ") || "none"}

Return JSON:
{
  "revenue_summary": "1-2 sentence summary of revenue performance this week",
  "marketing_summary": "1-2 sentence summary of marketing activity",
  "menu_insights": "1 sentence about what could drive revenue from the menu",
  "opportunities_detected": ["opportunity 1", "opportunity 2"],
  "recommended_actions": ["action 1", "action 2", "action 3"],
  "estimated_uplift": "Estimated revenue impact if actions are taken"
}

Be specific, actionable, venue-specific, and revenue-oriented. Keep it short.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const briefContent = aiData.choices?.[0]?.message?.content;
    if (!briefContent) {
      return new Response(JSON.stringify({ error: "No content" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brief = JSON.parse(briefContent);

    // Persist
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("venue_weekly_briefs")
      .upsert(
        {
          venue_id,
          week_start: weekStart,
          week_end: weekEnd,
          revenue_summary: brief.revenue_summary || "",
          marketing_summary: brief.marketing_summary || "",
          menu_insights: brief.menu_insights || "",
          opportunities_detected: brief.opportunities_detected || [],
          recommended_actions: brief.recommended_actions || [],
          estimated_uplift: brief.estimated_uplift || null,
        },
        { onConflict: "venue_id,week_start" }
      )
      .select()
      .single();

    if (saveErr) {
      console.error("Save error:", saveErr);
      return new Response(JSON.stringify({ error: "Failed to save brief" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ brief: saved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("weekly brief error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
