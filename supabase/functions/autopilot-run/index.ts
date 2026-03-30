import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RunType = "daily_content" | "weekly_campaign" | "review_content";

type GeneratedItem = {
  title: string;
  caption: string;
  cta: string | null;
  hashtags: string[];
  asset_type: "static" | "video";
  content_brief: string | null;
  creative_brief: string | null;
  suggested_scheduled_for: string | null;
  campaign_tag: string | null;
  badges: string[];
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    let venueId: string | null = body.venue_id || null;
    let runType: RunType = body.run_type || "daily_content";

    if (venueId && token !== serviceKey) {
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
        .select("venue_id, frequency")
        .eq("is_enabled", true);

      if (settings) {
        const now = new Date();
        const dayOfWeek = now.getDay();
        for (const s of settings) {
          const shouldRun = s.frequency === "daily"
            || (s.frequency === "3x_week" && [1, 3, 5].includes(dayOfWeek))
            || (s.frequency === "weekly" && dayOfWeek === 1);
          if (shouldRun) venueIds.push(s.venue_id);
        }
      }

      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 1) runType = "weekly_campaign";
    }

    const results: any[] = [];

    for (const vid of venueIds) {
      try {
        const result = await runAutopilot(supabase, vid, runType);
        results.push({ venue_id: vid, ...result });
      } catch (err: any) {
        results.push({ venue_id: vid, status: "failed", error: err.message });
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
    pendingReviews,
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

async function runAutopilot(supabase: any, venueId: string, runType: RunType) {
  const { data: settings } = await supabase
    .from("autopilot_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();

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

    const prompt = runType === "weekly_campaign"
      ? buildWeeklyCampaignPrompt(ctx, contentCount)
      : runType === "review_content"
        ? buildReviewContentPrompt(ctx)
        : buildDailyContentPrompt(ctx, contentCount);

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
    const rawContent = String(aiData.choices?.[0]?.message?.content || "");
    const { items, parseError } = parseAndNormalizeItems(rawContent, runType);

    const contentItemIds: string[] = [];
    const saveErrors: string[] = [];

    for (const item of items) {
      const { data: ci, error: ciErr } = await supabase
        .from("content_items")
        .insert({
          venue_id: venueId,
          source: "autopilot",
          run_type: runType,
          autopilot_run_id: runId,
          title: item.title,
          caption_draft: item.caption,
          caption_final: null,
          cta: item.cta,
          hashtags: item.hashtags,
          content_brief: item.content_brief,
          creative_brief: item.creative_brief,
          asset_type: item.asset_type,
          intent: "standard",
          status: "draft",
          suggested_scheduled_for: item.suggested_scheduled_for,
          scheduled_for: null,
          campaign_tag: item.campaign_tag,
          badges: item.badges,
          source_plan_title: `Autopilot ${runType === "weekly_campaign" ? "Weekly" : runType === "review_content" ? "Review" : "Daily"} — ${new Date().toISOString().split("T")[0]}`,
        })
        .select("id")
        .single();

      if (ciErr || !ci) {
        saveErrors.push(ciErr?.message || "Unknown save error");
      } else {
        contentItemIds.push(ci.id);
      }
    }

    const itemsGenerated = items.length;
    const itemsSaved = contentItemIds.length;
    const itemsFailed = (parseError ? itemsGenerated || 1 : 0) + Math.max(0, itemsGenerated - itemsSaved);

    const runStatus = parseError
      ? "failed"
      : itemsGenerated === 0
        ? "failed"
        : itemsSaved === 0
          ? "failed"
          : itemsFailed > 0
            ? "partial_failed"
            : "completed";

    const errorMessage = parseError
      ? `Autopilot JSON parse failed: ${parseError}`
      : saveErrors.length > 0
        ? `Saved ${itemsSaved}/${itemsGenerated} items. ${saveErrors[0]}`
        : null;

    await supabase.from("autopilot_runs").update({
      status: runStatus,
      completed_at: new Date().toISOString(),
      content_item_ids: contentItemIds,
      raw_ai_output: rawContent,
      parse_error: parseError,
      items_generated: itemsGenerated,
      items_saved: itemsSaved,
      items_failed: itemsFailed,
      error_message: errorMessage,
      output_summary: {
        items_generated: itemsGenerated,
        items_saved: itemsSaved,
        items_failed: itemsFailed,
        run_type: runType,
        parse_error: parseError,
        save_errors: saveErrors,
      },
    }).eq("id", runId);

    if (runStatus === "failed") {
      throw new Error(errorMessage || "Autopilot run failed");
    }

    return {
      status: runStatus,
      run_id: runId,
      items_generated: itemsGenerated,
      items_saved: itemsSaved,
      items_failed: itemsFailed,
      content_item_ids: contentItemIds,
      error_message: errorMessage,
    };
  } catch (err: any) {
    await supabase.from("autopilot_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: err.message,
      items_failed: 1,
    }).eq("id", runId);
    throw err;
  }
}

function parseAndNormalizeItems(rawContent: string, runType: RunType): { items: GeneratedItem[]; parseError: string | null } {
  const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: any;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return { items: [], parseError: err.message || "Invalid JSON output" };
  }

  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const normalized = arr.map((item, idx) => normalizeItem(item, idx, runType)).filter(Boolean) as GeneratedItem[];
  return { items: normalized, parseError: null };
}

function normalizeItem(item: any, index: number, runType: RunType): GeneratedItem | null {
  if (!item || typeof item !== "object") return null;

  const caption = String(item.caption || item.content || "").trim();
  if (!caption) return null;

  const hashtagValues = Array.isArray(item.hashtags)
    ? item.hashtags
    : typeof item.hashtags === "string"
      ? item.hashtags.split(/\s+/)
      : caption.split(/\s+/).filter((token: string) => token.startsWith("#"));

  const hashtags = hashtagValues
    .map((tag: string) => String(tag).trim())
    .filter(Boolean)
    .map((tag: string) => (tag.startsWith("#") ? tag : `#${tag}`));

  const assetTypeRaw = String(item.asset_type || "image").toLowerCase();
  const asset_type = assetTypeRaw.includes("reel") || assetTypeRaw.includes("video") ? "video" : "static";

  const title = String(item.title || `Autopilot ${runType.replace("_", " ")} #${index + 1}`).slice(0, 120);
  const suggested = item.suggested_scheduled_time || item.scheduled_for || null;

  const badges = ["Autopilot"];
  if (runType === "review_content") badges.push("Review-based");
  if (runType === "weekly_campaign") badges.push("Weekly Campaign");
  if (!item.asset_url) badges.push("Needs Asset");
  badges.push("Ready to Schedule");

  return {
    title,
    caption,
    cta: item.cta ? String(item.cta) : null,
    hashtags,
    asset_type,
    content_brief: item.content_brief ? String(item.content_brief) : null,
    creative_brief: item.creative_brief ? String(item.creative_brief) : (item.content_brief ? String(item.content_brief) : null),
    suggested_scheduled_for: suggested ? new Date(suggested).toISOString() : null,
    campaign_tag: item.campaign_tag ? String(item.campaign_tag) : null,
    badges,
  };
}

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
- "title": short working title
- "caption": the full post caption
- "asset_type": "image" or "reel"
- "content_brief": short description of what visual to create (max 100 chars)
- "creative_brief": optional richer art direction
- "cta": call-to-action text
- "hashtags": array of hashtags
- "suggested_scheduled_time": suggested ISO datetime for posting (use today's date, optimal times)
- "campaign_tag": optional campaign tag

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
- "title"
- "caption"
- "asset_type"
- "content_brief"
- "creative_brief"
- "cta"
- "hashtags"
- "day": one of ${JSON.stringify(days)}
- "suggested_scheduled_time": suggested ISO datetime for posting
- "campaign_tag"

Return ONLY the JSON array.`;
}

function buildReviewContentPrompt(ctx: any): string {
  return `You are an expert hospitality social strategist.

VENUE CONTEXT:
${ctx.contextString}

Generate 2 social posts that transform recent guest sentiment into marketing content.

Return a JSON array with fields:
- "title"
- "caption"
- "asset_type"
- "content_brief"
- "creative_brief"
- "cta"
- "hashtags"
- "suggested_scheduled_time"
- "campaign_tag"

Return ONLY the JSON array.`;
}
