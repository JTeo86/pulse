import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Accept venue_id from body or generate for all venues
    const body = await req.json().catch(() => ({}));
    let venueIds: string[] = [];

    if (body.venue_id) {
      venueIds = [body.venue_id];
    } else {
      const { data: venues } = await supabase.from("venues").select("id");
      venueIds = (venues || []).map((v: any) => v.id);
    }

    const results: any[] = [];

    for (const venueId of venueIds) {
      try {
        const plan = await generatePlanForVenue(supabase, venueId);
        results.push({ venue_id: venueId, status: "ok", tasks: plan.length });
      } catch (err: any) {
        results.push({ venue_id: venueId, status: "error", error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generatePlanForVenue(supabase: any, venueId: string) {
  // Get current week start (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  // Check if plan already exists for this week
  const { data: existing } = await supabase
    .from("marketing_plans")
    .select("id")
    .eq("venue_id", venueId)
    .eq("week_start", weekStartStr)
    .maybeSingle();

  if (existing) {
    return []; // Plan already exists
  }

  // Gather venue context
  const [venueRes, profileRes, brandKitRes, reviewsRes, contentRes, styleRes] =
    await Promise.all([
      supabase.from("venues").select("name, city, country_code, timezone").eq("id", venueId).single(),
      supabase.from("venue_style_profiles").select("cuisine_type, venue_tone, brand_summary").eq("venue_id", venueId).maybeSingle(),
      supabase.from("brand_kits").select("preset, rules_text").eq("venue_id", venueId).maybeSingle(),
      supabase.from("review_response_tasks").select("id, status, rating").eq("venue_id", venueId).eq("status", "pending").limit(10),
      supabase.from("content_items").select("id, status, created_at").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(20),
      supabase.from("style_reference_assets").select("id, channel").eq("venue_id", venueId).eq("status", "analyzed"),
    ]);

  const venue = venueRes.data;
  const profile = profileRes.data;
  const brandKit = brandKitRes.data;
  const pendingReviews = reviewsRes.data?.length || 0;
  const recentContent = contentRes.data || [];
  const styleAssets = styleRes.data || [];

  // Build context for AI
  const venueName = venue?.name || "Unnamed Venue";
  const cuisine = profile?.cuisine_type || "General hospitality";
  const tone = profile?.venue_tone || brandKit?.preset || "casual";
  const brandSummary = profile?.brand_summary || brandKit?.rules_text || "";
  const hasStyleTraining = styleAssets.length >= 3;
  const publishedThisMonth = recentContent.filter(
    (c: any) => c.status === "published" && new Date(c.created_at) > new Date(Date.now() - 30 * 86400000)
  ).length;

  // Day labels for the week
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Generate the AI prompt
  const prompt = `You are a hospitality marketing strategist for "${venueName}".
Cuisine: ${cuisine}
Tone: ${tone}
Location: ${venue?.city || "Unknown"}
Brand summary: ${brandSummary || "Not provided"}
Style training: ${hasStyleTraining ? "Active" : "Not yet configured"}
Pending reviews: ${pendingReviews}
Content published this month: ${publishedThisMonth}

Generate a weekly marketing plan with 5-8 actionable tasks for the week of ${weekStartStr}.
Each task must be specific and executable.

Return a JSON array where each item has:
- "day": one of ${JSON.stringify(days)}
- "time": suggested time in HH:MM format (24h)
- "task_type": one of "photo_post", "reel", "campaign", "review_response", "promotion", "story"
- "title": short task title (max 60 chars)
- "description": detailed instructions (max 200 chars)
- "priority": "high" or "medium" or "low"

Rules:
- Include at least 1 photo post task
- If pending reviews > 0, include a review response task on Monday
- Weekend tasks should focus on high-engagement content
- Space tasks throughout the week
- Match the brand tone

Return ONLY the JSON array, no other text.`;

  // Call AI via Lovable gateway
  const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`AI request failed: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "[]";

  // Parse the AI response
  let planTasks: any[];
  try {
    const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    planTasks = JSON.parse(cleaned);
  } catch {
    planTasks = [
      {
        day: "Monday",
        time: "10:00",
        task_type: "review_response",
        title: "Respond to pending reviews",
        description: "Review and respond to guest feedback on Google and other platforms",
        priority: "high",
      },
      {
        day: "Wednesday",
        time: "18:00",
        task_type: "photo_post",
        title: "Share signature dish photo",
        description: `Post a professional photo of your best-selling dish with engaging caption`,
        priority: "high",
      },
      {
        day: "Friday",
        time: "17:30",
        task_type: "story",
        title: "Behind-the-scenes story",
        description: "Share kitchen prep or team moments to build authenticity",
        priority: "medium",
      },
      {
        day: "Saturday",
        time: "12:00",
        task_type: "promotion",
        title: "Weekend special promotion",
        description: "Highlight weekend menu specials or events",
        priority: "medium",
      },
    ];
  }

  // Enrich tasks with status
  const enrichedTasks = planTasks.map((task: any, index: number) => ({
    ...task,
    id: crypto.randomUUID(),
    status: "pending",
    sort_order: index,
  }));

  // Save to database
  const { error } = await supabase.from("marketing_plans").upsert(
    {
      venue_id: venueId,
      week_start: weekStartStr,
      plan_data: enrichedTasks,
      status: "draft",
    },
    { onConflict: "venue_id,week_start" }
  );

  if (error) throw error;

  // Emit system event
  await supabase.from("system_events").insert({
    venue_id: venueId,
    event_type: "marketing_plan_generated",
    event_payload: { week_start: weekStartStr, task_count: enrichedTasks.length },
  });

  return enrichedTasks;
}
