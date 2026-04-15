import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, resolveModelForTask, chatCompletionsUrl } from "../_shared/ai-key-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const isServiceRoleRequest = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let userId: string | null = null;

    if (!isServiceRoleRequest) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const { venue_id, week_start, week_end } = await req.json();
    if (!venue_id || !week_start || !week_end) {
      return new Response(JSON.stringify({ error: "venue_id, week_start, week_end required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Venue membership check ---
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!isServiceRoleRequest && userId) {
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

    const aiConfig = await resolveAiConfig();

    // Fetch reviews for the date range
    const { data: reviewsByDate, error: revErr } = await supabaseAdmin
      .from("reviews")
      .select("*")
      .eq("venue_id", venue_id)
      .gte("review_date", week_start)
      .lte("review_date", week_end)
      .order("review_date", { ascending: false });

    const { data: reviewsByCreated } = await supabaseAdmin
      .from("reviews")
      .select("*")
      .eq("venue_id", venue_id)
      .is("review_date", null)
      .gte("created_at", week_start)
      .lte("created_at", week_end + "T23:59:59Z")
      .order("created_at", { ascending: false });

    if (revErr) {
      console.error("Failed to fetch reviews:", revErr);
      return new Response(JSON.stringify({ error: "Failed to fetch reviews" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Merge and deduplicate
    const seenIds = new Set<string>();
    const reviews: typeof reviewsByDate = [];
    for (const r of [...(reviewsByDate || []), ...(reviewsByCreated || [])]) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        reviews.push(r);
      }
    }

    if (reviews.length === 0) {
      const emptyReport = {
        venue_id,
        week_start,
        week_end,
        summary_md: "No guest reviews were found for this week.",
        stats: {
          total_reviews: 0,
          avg_rating: null,
          five_star_count: 0,
          one_two_star_count: 0,
          sources: {},
        },
        action_items: {
          headline: "No review activity this week",
          what_went_well: [],
          what_to_fix: [],
          items: [],
        },
        reply_templates: [],
      };

      await supabaseAdmin
        .from("weekly_review_reports")
        .upsert(emptyReport, { onConflict: "venue_id,week_start,week_end" });

      return new Response(JSON.stringify({
        saved: true,
        no_reviews: true,
        report: {
          headline: "No review activity this week",
          summary_md: emptyReport.summary_md,
          stats: emptyReport.stats,
          what_went_well: [],
          what_to_fix: [],
          action_items: [],
          reply_templates: [],
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch venue info
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select("name")
      .eq("id", venue_id)
      .maybeSingle();

    const reviewSummaries = reviews.map(r => ({
      source: r.source,
      rating: r.rating,
      text: r.review_text?.substring(0, 500) || "",
      author: r.author_name,
      date: r.review_date,
    }));

    const systemPrompt = `You are a senior hospitality operations analyst. Generate a structured weekly review report for ${venue?.name || "this venue"}.

RULES:
- Be specific, data-driven, and actionable
- Never admit liability or offer compensation in reply templates
- Focus on operational improvements
- Categorise action items by team: FOH (front of house), BOH (back of house), Management
- Priority codes: P1 (fix this week), P2 (fix this month), P3 (monitor)

Return a JSON object with this EXACT structure:
{
  "headline": "One-line summary of the week",
  "summary_md": "A 3-4 paragraph markdown summary of the week's performance",
  "stats": {
    "total_reviews": number,
    "avg_rating": number,
    "five_star_count": number,
    "one_two_star_count": number,
    "sources": { "google": number, "opentable": number }
  },
  "what_went_well": ["string"],
  "what_to_fix": ["string"],
  "action_items": [
    { "team": "FOH|BOH|Management", "priority": "P1|P2|P3", "action": "string" }
  ],
  "reply_templates": [
    { "for_review": "brief description of which review this is for", "reply": "brand-safe reply template" }
  ]
}`;

    const aiResponse = await fetch(chatCompletionsUrl(aiConfig), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveModelForTask('weekly_report', aiConfig),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here are ${reviews.length} reviews from ${week_start} to ${week_end}:\n\n${JSON.stringify(reviewSummaries, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", status, errorText);
      return new Response(JSON.stringify({ error: "Failed to generate report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let report;
    try {
      report = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI report:", content);
      return new Response(JSON.stringify({ error: "Failed to parse report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("weekly_review_reports")
      .upsert({
        venue_id,
        week_start,
        week_end,
        summary_md: report.summary_md || report.headline || "",
        stats: report.stats || {},
        action_items: {
          headline: report.headline,
          what_went_well: report.what_went_well,
          what_to_fix: report.what_to_fix,
          items: report.action_items,
        },
        reply_templates: report.reply_templates || [],
      }, { onConflict: "venue_id,week_start,week_end" })
      .select()
      .single();

    if (saveErr) {
      console.error("Failed to save report:", saveErr);
      return new Response(JSON.stringify({ report, saved: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generated weekly report for venue ${venue_id}: ${week_start} to ${week_end}`);

    return new Response(JSON.stringify({ report, saved: true, id: saved?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-weekly-review-report error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
