import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue_id, week_start, week_end } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch reviews for the period
    let query = supabaseAdmin
      .from("reviews")
      .select("*")
      .eq("venue_id", venue_id)
      .order("review_date", { ascending: false });

    if (week_start && week_end) {
      query = query.gte("review_date", week_start).lte("review_date", week_end + "T23:59:59Z");
    } else {
      // Default: last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      query = query.gte("review_date", sevenDaysAgo);
    }

    const { data: reviews, error: revErr } = await query;
    if (revErr) throw revErr;

    // Also get reviews with null review_date but recent created_at
    const { data: reviewsByCreated } = await supabaseAdmin
      .from("reviews")
      .select("*")
      .eq("venue_id", venue_id)
      .is("review_date", null)
      .gte("created_at", week_start || new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false });

    // Merge and deduplicate
    const seenIds = new Set<string>();
    const allReviews: typeof reviews = [];
    for (const r of [...(reviews || []), ...(reviewsByCreated || [])]) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        allReviews.push(r);
      }
    }

    if (allReviews.length === 0) {
      return new Response(JSON.stringify({ tasks_created: 0, message: "No reviews to triage" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prepare review summaries for AI
    const reviewSummaries = allReviews.map(r => ({
      id: r.id,
      source: r.source,
      rating: r.rating,
      text: r.review_text?.substring(0, 500) || "",
      author: r.author_name,
      date: r.review_date || r.created_at,
    }));

    const systemPrompt = `You are a hospitality review triage specialist. Analyze these reviews and identify which ones NEED a response from management.

RULES for recommending a response:
- rating <= 3 (negative experience)
- Allegations or claims that could damage reputation
- Service failure or safety complaints
- Misinformation that should be politely corrected
- Detailed complaints about specific issues (food, service, cleanliness)

DO NOT recommend responding to:
- Generic positive reviews (4-5 stars with no specific complaint)
- Obvious spam (unless high-risk)
- Reviews that are just a rating with no text

Return a JSON object:
{
  "tasks": [
    {
      "review_id": "uuid of the review",
      "reason": "Brief explanation of why this needs a response",
      "priority": "P1|P2|P3"
    }
  ]
}

Priority guide:
- P1: Safety issues, serious allegations, potential legal/PR risk. Respond this week.
- P2: Service failures, specific complaints. Respond within 2 weeks.
- P3: Minor issues, constructive feedback worth acknowledging. Respond when convenient.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Triage these ${allReviews.length} reviews:\n\n${JSON.stringify(reviewSummaries, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI triage error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI triage failed" }), {
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

    let triageResult;
    try {
      triageResult = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI triage:", content);
      return new Response(JSON.stringify({ error: "Failed to parse triage result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tasks = triageResult.tasks || [];
    let tasksCreated = 0;

    // Build a map of review_id -> review for quick lookup
    const reviewMap = new Map(allReviews.map(r => [r.id, r]));

    for (const task of tasks) {
      const review = reviewMap.get(task.review_id);
      if (!review) continue;

      const { error: upsertErr } = await supabaseAdmin
        .from("review_response_tasks")
        .upsert({
          venue_id,
          review_id: review.id,
          source: review.source,
          review_date: review.review_date,
          rating: review.rating,
          author_name: review.author_name,
          review_text: review.review_text?.substring(0, 2000),
          ai_reason: task.reason,
          ai_priority: task.priority,
          status: "pending",
        }, { onConflict: "venue_id,review_id" });

      if (upsertErr) {
        console.error("Failed to upsert response task:", upsertErr);
      } else {
        tasksCreated++;
      }
    }

    console.log(`Generated ${tasksCreated} response tasks for venue ${venue_id}`);

    return new Response(JSON.stringify({ tasks_created: tasksCreated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-review-response-tasks error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
