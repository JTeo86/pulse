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
    const body = await req.json().catch(() => ({}));

    // Auth: require either service role key (cron) or valid user JWT with venue membership
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    let venueId: string | null = body.venue_id || null;
    let runType: string = body.run_type || "daily_content";

    if (venueId && token !== serviceKey) {
      // User-initiated run — validate membership
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: isMember } = await admin.rpc("is_venue_member", {
        check_venue_id: venueId, check_user_id: user.id,
      });
      if (!isMember) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // If no venue_id, this is a cron call — find all enabled venues due for a run
    let venueIds: string[] = [];
    if (venueId) {
      venueIds = [venueId];
    } else {
      if (token !== serviceKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: settings } = await supabase
        .from("autopilot_settings")
        .select("venue_id, frequency, run_time")
        .eq("is_enabled", true);

      if (settings) {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
        for (const s of settings) {
          const shouldRun = s.frequency === "daily"
            || (s.frequency === "3x_week" && [1, 3, 5].includes(dayOfWeek))
            || (s.frequency === "weekly" && dayOfWeek === 1);
          if (shouldRun) venueIds.push(s.venue_id);
        }
      }

      // Weekly campaign on Mondays
      if (dayOfWeek === 1) runType = "weekly_campaign";
    }

    const results: any[] = [];

    for (const vid of venueIds) {
      try {
        const result = await runAutopilot(supabase, vid, runType);
        results.push({ venue_id: vid, status: "ok", ...result });
      } catch (err: any) {
        results.push({ venue_id: vid, status: "error", error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Context Builder ───────────────────────────────────────────────
async function buildVenueContext(supabase: any, venueId: string) {
  const [venueRes, profileRes, brandKitRes, reviewsRes, contentRes, eventsRes] = await Promise.all([
    supabase.from("venues").select("name, city, country_code, timezone, website_url, instagram_handle").eq("id", venueId).single(),
    supabase.from("venue_style_profiles").select("cuisine_type, venue_tone, brand_summary, target_audience, key_selling_points").eq("venue_id", venueId).maybeSingle(),
    supabase.from("brand_kits").select("preset, rules_text").eq("venue_id", venueId).maybeSingle(),
    supabase.from("review_response_tasks").select("id, rating, review_text").eq("venue_id", venueId).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
    supabase.from("content_items").select("id, status, caption_final, scheduled_for, created_at").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(20),
    supabase.from("venue_event_plans").select("id, title, status, starts_at").eq("venue_id", venueId).eq("status", "active").limit(5),
  ]);

  const venue = venueRes.data;
  const profile = profileRes.data;
  const brandKit = brandKitRes.data;
  const pendingReviews = reviewsRes.data || [];
  const recentContent = contentRes.data || [];
  const upcomingEvents = eventsRes.data || [];

  return {
    venue,
    profile,
    brandKit,
    pendingReviews,
    recentContent,
    upcomingEvents,
    contextString: [
      `Venue: ${venue?.name || "Unknown"} (${venue?.city || venue?.country_code || "Unknown"})`,
      profile?.cuisine_type ? `Cuisine: ${profile.cuisine_type}` : "",
      `Tone: ${profile?.venue_tone || brandKit?.preset || "casual"}`,
      profile?.brand_summary ? `Brand: ${profile.brand_summary}` : "",
      profile?.target_audience ? `Audience: ${profile.target_audience}` : "",
      profile?.key_selling_points ? `Key selling points: ${profile.key_selling_points}` : "",
      brandKit?.rules_text ? `Brand rules: ${brandKit.rules_text}` : "",
      venue?.instagram_handle ? `Instagram: @${venue.instagram_handle}` : "",
      upcomingEvents.length > 0 ? `Upcoming campaigns: ${upcomingEvents.map((e: any) => e.title).join(", ")}` : "",
      pendingReviews.length > 0 ? `Pending reviews: ${pendingReviews.length}` : "",
      `Recently published: ${recentContent.filter((c: any) => c.status === "published").length} items this month`,
    ].filter(Boolean).join("\n"),
  };
}

// ─── Main Runner ───────────────────────────────────────────────────
async function runAutopilot(supabase: any, venueId: string, runType: string) {
  // Check settings
  const { data: settings } = await supabase
    .from("autopilot_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();

  // Create run record
  const { data: run, error: runErr } = await supabase
    .from("autopilot_runs")
    .insert({
      venue_id: venueId,
      run_type: runType,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runErr) throw runErr;
  const runId = run.id;

  try {
    const ctx = await buildVenueContext(supabase, venueId);
    const volume = settings?.content_volume || "medium";
    const contentCount = volume === "low" ? 1 : volume === "high" ? 3 : 2;

    let prompt: string;
    if (runType === "weekly_campaign") {
      prompt = buildWeeklyCampaignPrompt(ctx, contentCount);
    } else if (runType === "review_content") {
      prompt = buildReviewContentPrompt(ctx);
    } else {
      prompt = buildDailyContentPrompt(ctx, contentCount);
    }

    // Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResponse.ok) throw new Error(`AI request failed: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";
    const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let items: any[];
    try {
      items = JSON.parse(cleaned);
      if (!Array.isArray(items)) items = [items];
    } catch {
      items = [];
    }

    // Save each generated item as a content_item draft
    const contentItemIds: string[] = [];
    const approvalMode = settings?.approval_mode || "require_approval";

    for (const item of items) {
      const status = approvalMode === "auto_schedule" ? "scheduled" : "draft";
      const { data: ci, error: ciErr } = await supabase
        .from("content_items")
        .insert({
          venue_id: venueId,
          caption_draft: item.caption || item.content || "",
          caption_final: approvalMode === "auto_schedule" ? (item.caption || item.content || "") : null,
          asset_type: item.asset_type || "image",
          intent: "standard",
          status,
          scheduled_for: item.scheduled_for || null,
          source_plan_title: `Autopilot ${runType === "weekly_campaign" ? "Weekly" : "Daily"} — ${new Date().toISOString().split("T")[0]}`,
        })
        .select("id")
        .single();

      if (!ciErr && ci) contentItemIds.push(ci.id);
    }

    // Update run as completed
    await supabase.from("autopilot_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      content_item_ids: contentItemIds,
      output_summary: {
        items_generated: items.length,
        items_saved: contentItemIds.length,
        run_type: runType,
        approval_mode: approvalMode,
      },
    }).eq("id", runId);

    return { items_generated: items.length, items_saved: contentItemIds.length };
  } catch (err: any) {
    await supabase.from("autopilot_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: err.message,
    }).eq("id", runId);
    throw err;
  }
}

// ─── Prompt Builders ───────────────────────────────────────────────
function buildDailyContentPrompt(ctx: any, count: number): string {
  const today = new Date();
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];

  return `You are an expert hospitality social media manager.

VENUE CONTEXT:
${ctx.contextString}

TODAY: ${dayName}, ${today.toISOString().split("T")[0]}

Generate exactly ${count} social media content piece(s) for today.

Each piece should:
- Be immediately postable on Instagram/TikTok
- Match the venue's brand tone and audience
- Include a strong caption with emojis and CTA
- Suggest relevant hashtags (5-8)
- Be specific to this venue, not generic
- Reference actual menu items, ambiance, or seasonal moments

${ctx.pendingReviews.length > 0 ? `Consider turning this positive review into social proof: "${ctx.pendingReviews[0]?.review_text?.substring(0, 200) || ""}"` : ""}

Return a JSON array where each item has:
- "caption": the full post caption with hashtags
- "asset_type": "image" or "reel"
- "content_brief": short description of what visual to create (max 100 chars)
- "cta": call-to-action text
- "scheduled_for": suggested ISO datetime for posting (use today's date, optimal times)

Return ONLY the JSON array.`;
}

function buildWeeklyCampaignPrompt(ctx: any, dailyCount: number): string {
  const weekStart = new Date();
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return `You are an expert hospitality marketing strategist.

VENUE CONTEXT:
${ctx.contextString}

WEEK STARTING: ${weekStart.toISOString().split("T")[0]}

Create a 7-day content campaign plan. Generate ${dailyCount * 5} content pieces spread across the week.

Each piece should:
- Be specific to this venue
- Match brand tone
- Include a strong caption with emojis, hashtags, and CTA
- Cover a mix: behind-the-scenes, dish highlights, social proof, promotions, atmosphere
- Weekend content should be higher-engagement

${ctx.upcomingEvents.length > 0 ? `Tie content to these upcoming campaigns: ${ctx.upcomingEvents.map((e: any) => e.title).join(", ")}` : ""}

Return a JSON array where each item has:
- "caption": the full post caption with hashtags
- "asset_type": "image" or "reel"
- "content_brief": short description of what visual to create (max 100 chars)
- "cta": call-to-action text
- "day": one of ${JSON.stringify(days)}
- "scheduled_for": suggested ISO datetime for posting

Return ONLY the JSON array.`;
}

function buildReviewContentPrompt(ctx: any): string {
  const reviews = ctx.pendingReviews.slice(0, 3);
  if (reviews.length === 0) {
    return `Return an empty JSON array: []`;
  }

  return `You are an expert hospitality social media manager specializing in social proof content.

VENUE CONTEXT:
${ctx.contextString}

RECENT POSITIVE REVIEWS:
${reviews.map((r: any, i: number) => `${i + 1}. Rating: ${r.rating}/5 — "${r.review_text?.substring(0, 300) || "Great experience"}"`).join("\n")}

Create ${Math.min(reviews.length, 2)} social media posts that:
- Turn these reviews into compelling social proof content
- Quote the review naturally (can paraphrase)
- Add a warm, grateful response tone matching the venue's brand
- Include emojis and 5-8 relevant hashtags
- End with a CTA (book now, visit us, etc.)

Also create ${Math.min(reviews.length, 2)} reply suggestion(s) for the reviews.

Return a JSON array where each item has:
- "caption": the full social post caption
- "asset_type": "image"
- "content_brief": visual suggestion for the post (max 100 chars)
- "cta": call-to-action text
- "reply_suggestion": a suggested reply to the original review (or null if this is just a social post)

Return ONLY the JSON array.`;
}
