import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, resolveModelForTask, chatCompletionsUrl } from "../_shared/ai-key-resolver.ts";

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
  asset_url?: string | null;
  storage_path?: string | null;
  source_asset_id?: string | null;
  source_asset_title?: string | null;
};

type SaveErrorDetail = {
  index: number;
  title: string | null;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

type AssetCandidate = {
  source_priority: number;
  source: string;
  source_asset_id: string;
  source_asset_title: string;
  asset_url: string | null;
  storage_path: string | null;
};

type AssetSelectionResult = {
  assets: AssetCandidate[];
  totalEligible: number;
  usedCopyOnlyFallback: boolean;
  isAssetBlocked: boolean;
  summary: {
    priority_1: number;
    priority_2: number;
    priority_3: number;
    priority_4: number;
    priority_5: number;
    eligible_total: number;
  };
  diagnosticMessage: string;
  recommendedNextActions: string[];
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
    const sourceSelection = await selectAssetSources(
      supabase,
      venueId,
      contentCount,
      settings?.allow_copy_only_fallback ?? false,
    );
    const requireAsset = settings?.require_asset_for_runs ?? true;
    const allowCopyOnlyFallback = settings?.allow_copy_only_fallback ?? false;

    if (sourceSelection.totalEligible === 0 && requireAsset && !allowCopyOnlyFallback) {
      const blockedReason = sourceSelection.diagnosticMessage || "No eligible image sources available";
      await createNeedsAssetTaskRecommendation(supabase, venueId, sourceSelection.recommendedNextActions);
      await supabase.from("autopilot_runs").update({
        status: "partial",
        completed_at: new Date().toISOString(),
        run_status: "partial",
        error_message: blockedReason,
        items_generated: 0,
        items_saved: 0,
        items_failed: 0,
        generated_count: 0,
        saved_count: 0,
        failed_count: 0,
        output_summary: {
          run_type: runType,
          skipped: false,
          copy_only_fallback_used: false,
          asset_blocked: true,
          blocked_reason: blockedReason,
          diagnostic_message: blockedReason,
          recommended_next_asset_actions: sourceSelection.recommendedNextActions,
          source_summary: sourceSelection.summary,
        },
      }).eq("id", runId);

      return {
        status: "partial",
        run_id: runId,
        items_generated: 0,
        items_saved: 0,
        items_failed: 0,
        generated_count: 0,
        saved_count: 0,
        failed_count: 0,
        content_item_ids: [],
        saved_library_item_ids: [],
        error_message: blockedReason,
        output_summary: {
          copy_only_fallback_used: false,
          asset_blocked: true,
          recommended_next_asset_actions: sourceSelection.recommendedNextActions,
        },
      };
    }

    const prompt = runType === "weekly_campaign"
      ? buildWeeklyCampaignPrompt(ctx, contentCount, sourceSelection.assets, settings?.mode || "conservative")
      : runType === "review_content"
        ? buildReviewContentPrompt(ctx, sourceSelection.assets, settings?.mode || "conservative")
        : buildDailyContentPrompt(ctx, contentCount, sourceSelection.assets, settings?.mode || "conservative");

    const aiConfig = await resolveAiConfig();
    const aiResponse = await fetch(chatCompletionsUrl(aiConfig), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: resolveModelForTask('autopilot', aiConfig),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI request failed: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const rawContent = String(aiData.choices?.[0]?.message?.content || "");
    const { parsedItems, items, parseError, normalizationErrors } = parseAndNormalizeItems(rawContent, runType);

    const contentItemIds: string[] = [];
    const saveErrorDetails: SaveErrorDetail[] = [];

    for (const [index, item] of items.entries()) {
      const sourceAsset = sourceSelection.assets.length > 0
        ? sourceSelection.assets[index % sourceSelection.assets.length]
        : null;
      const insertPayload: Record<string, unknown> = {
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
        media_master_url: sourceAsset?.asset_url || null,
        storage_path: sourceAsset?.storage_path || null,
        media_variants: sourceAsset ? {
          source_asset_id: sourceAsset.source_asset_id,
          source_asset_title: sourceAsset.source_asset_title,
          source_priority: sourceAsset.source_priority,
        } : null,
        suggested_scheduled_for: item.suggested_scheduled_for,
        scheduled_for: null,
        campaign_tag: item.campaign_tag,
        badges: item.badges,
        source_plan_title: `Autopilot ${runType === "weekly_campaign" ? "Weekly" : runType === "review_content" ? "Review" : "Daily"} — ${new Date().toISOString().split("T")[0]}`,
      };

      const { data: ci, error: ciErr } = await insertContentItem(supabase, insertPayload);

      if (ciErr || !ci) {
        saveErrorDetails.push({
          index,
          title: item.title ?? null,
          message: ciErr?.message || "Unknown save error",
          code: ciErr?.code,
          details: ciErr?.details,
          hint: ciErr?.hint,
        });
      } else {
        contentItemIds.push(ci.id);
      }
    }

    const generatedCount = parsedItems.length;
    const savedCount = contentItemIds.length;
    const failedCount = Math.max(0, generatedCount - savedCount);
    const combinedSaveErrorDetails: SaveErrorDetail[] = [
      ...normalizationErrors,
      ...saveErrorDetails,
    ];

    const runStatus: "failed" | "partial" | "completed" = parseError
      ? "failed"
      : generatedCount === 0
        ? "failed"
        : savedCount === 0
          ? "failed"
          : failedCount > 0
            ? "partial"
            : "completed";

    const errorMessage = parseError
      ? `Autopilot JSON parse failed: ${parseError}`
      : combinedSaveErrorDetails.length > 0
        ? `Saved ${savedCount}/${generatedCount} items. ${combinedSaveErrorDetails[0]?.message || "One or more save errors occurred."}`
        : null;

    const { error: runUpdateError } = await supabase.from("autopilot_runs").update({
      status: runStatus,
      completed_at: new Date().toISOString(),
      content_item_ids: contentItemIds,
      saved_library_item_ids: contentItemIds,
      raw_ai_output: rawContent,
      parse_error: parseError,
      items_generated: generatedCount,
      items_saved: savedCount,
      items_failed: failedCount,
      generated_count: generatedCount,
      saved_count: savedCount,
      failed_count: failedCount,
      run_status: runStatus,
      error_message: errorMessage,
      save_error_details: combinedSaveErrorDetails,
      generated_item_payloads: parsedItems,
      output_summary: {
        items_generated: generatedCount,
        items_saved: savedCount,
        items_failed: failedCount,
        generated_count: generatedCount,
        saved_count: savedCount,
        failed_count: failedCount,
        run_status: runStatus,
        run_type: runType,
        source_summary: sourceSelection.summary,
        source_priority_used: sourceSelection.assets[0]?.source_priority || null,
        copy_only_fallback_used: sourceSelection.usedCopyOnlyFallback,
        asset_blocked: sourceSelection.isAssetBlocked,
        diagnostic_message: sourceSelection.diagnosticMessage,
        recommended_next_asset_actions: sourceSelection.recommendedNextActions,
        parse_error: parseError,
        save_error_details: combinedSaveErrorDetails,
        saved_library_item_ids: contentItemIds,
      },
    }).eq("id", runId);
    if (runUpdateError) {
      throw runUpdateError;
    }

    return {
      status: runStatus,
      run_id: runId,
      items_generated: generatedCount,
      items_saved: savedCount,
      items_failed: failedCount,
      generated_count: generatedCount,
      saved_count: savedCount,
      failed_count: failedCount,
      content_item_ids: contentItemIds,
      saved_library_item_ids: contentItemIds,
      error_message: errorMessage,
      save_error_details: combinedSaveErrorDetails,
      output_summary: {
        copy_only_fallback_used: sourceSelection.usedCopyOnlyFallback,
        asset_blocked: sourceSelection.isAssetBlocked,
        recommended_next_asset_actions: sourceSelection.recommendedNextActions,
      },
    };
  } catch (err: any) {
    await supabase.from("autopilot_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: err.message,
      run_status: "failed",
      generated_count: 0,
      saved_count: 0,
      failed_count: 0,
      items_generated: 0,
      items_saved: 0,
      items_failed: 0,
    }).eq("id", runId);
    throw err;
  }
}

async function insertContentItem(supabase: any, payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("content_items")
    .insert(payload)
    .select("id")
    .single();
  return { data, error };
}

function parseAndNormalizeItems(
  rawContent: string,
  runType: RunType,
): {
  parsedItems: any[];
  items: GeneratedItem[];
  parseError: string | null;
  normalizationErrors: SaveErrorDetail[];
} {
  const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: any;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return {
      parsedItems: [],
      items: [],
      parseError: err.message || "Invalid JSON output",
      normalizationErrors: [],
    };
  }

  const parsedItems = Array.isArray(parsed) ? parsed : [parsed];
  const items: GeneratedItem[] = [];
  const normalizationErrors: SaveErrorDetail[] = [];

  parsedItems.forEach((item, idx) => {
    const normalized = normalizeItem(item, idx, runType);
    if (normalized) {
      items.push(normalized);
      return;
    }
    normalizationErrors.push({
      index: idx,
      title: item?.title ? String(item.title) : null,
      message: "Generated item was missing required fields and could not be normalized.",
    });
  });

  return { parsedItems, items, parseError: null, normalizationErrors };
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

async function selectAssetSources(
  supabase: any,
  venueId: string,
  requestedCount: number,
  allowCopyOnlyFallback: boolean,
): Promise<AssetSelectionResult> {
  const reusableAssetsRes = await supabase
    .from("content_assets")
    .select("id, title, public_url, storage_path, metadata, status")
    .eq("venue_id", venueId)
    .eq("asset_type", "image")
    .in("status", ["approved", "draft", "scheduled", "published"])
    .order("created_at", { ascending: false })
    .limit(200);

  const reusableAssets = (reusableAssetsRes.data || []).filter((asset: any) =>
    asset?.metadata?.autopilot_reusable === true,
  );

  const plansRes = await supabase
    .from("venue_event_plans")
    .select("id")
    .eq("venue_id", venueId)
    .in("status", ["active", "draft"])
    .limit(30);

  const planIds = (plansRes.data || []).map((p: any) => p.id);
  const plannerAssets: any[] = [];
  if (planIds.length > 0) {
    const publishRes = await supabase
      .from("plan_publish_items")
      .select("content_asset_id")
      .in("plan_id", planIds)
      .not("content_asset_id", "is", null)
      .limit(200);
    const ids = Array.from(new Set((publishRes.data || []).map((p: any) => p.content_asset_id).filter(Boolean)));
    if (ids.length > 0) {
      const assetsRes = await supabase
        .from("content_assets")
        .select("id, title, public_url, storage_path")
        .eq("venue_id", venueId)
        .in("id", ids)
        .eq("asset_type", "image");
      plannerAssets.push(...(assetsRes.data || []));
    }
  }

  const approvedLibraryRes = await supabase
    .from("content_items")
    .select("id, title, media_master_url, storage_path, badges, status")
    .eq("venue_id", venueId)
    .eq("status", "approved")
    .not("media_master_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const approvedLibraryAssets = (approvedLibraryRes.data || []).filter((item: any) =>
    Array.isArray(item.badges) && item.badges.includes("Reusable"),
  );

  const recentVenueUploadsRes = await supabase
    .from("content_assets")
    .select("id, title, public_url, storage_path, source_type, status")
    .eq("venue_id", venueId)
    .eq("asset_type", "image")
    .in("status", ["approved", "draft", "scheduled", "published"])
    .order("created_at", { ascending: false })
    .limit(120);

  const recentVenueUploads = (recentVenueUploadsRes.data || []).filter((asset: any) =>
    asset?.source_type === "upload" || asset?.source_type === "guest_upload" || asset?.source_type === "manual",
  );

  const guestSubmissionsRes = await supabase
    .from("guest_submissions")
    .select("id, image_url, guest_name, created_at, status")
    .eq("venue_id", venueId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(120);
  const guestSubmissionAssets = (guestSubmissionsRes.data || []).filter((item: any) => !!item.image_url);

  const mappedRaw: AssetCandidate[] = [
    ...reusableAssets.map((a: any) => ({
      source_priority: 1,
      source: "autopilot_asset_pool",
      source_asset_id: a.id,
      source_asset_title: a.title || "Asset",
      asset_url: a.public_url,
      storage_path: a.storage_path,
    })),
    ...plannerAssets.map((a: any) => ({
      source_priority: 2,
      source: "planner_linked_asset",
      source_asset_id: a.id,
      source_asset_title: a.title || "Planner asset",
      asset_url: a.public_url,
      storage_path: a.storage_path,
    })),
    ...approvedLibraryAssets.map((i: any) => ({
      source_priority: 3,
      source: "approved_library_asset",
      source_asset_id: i.id,
      source_asset_title: i.title || "Library asset",
      asset_url: i.media_master_url,
      storage_path: i.storage_path,
    })),
    ...recentVenueUploads.map((a: any) => ({
      source_priority: 4,
      source: "recent_venue_upload",
      source_asset_id: a.id,
      source_asset_title: a.title || "Recent venue upload",
      asset_url: a.public_url,
      storage_path: a.storage_path,
    })),
    ...guestSubmissionAssets.map((g: any) => ({
      source_priority: 5,
      source: "approved_guest_submission",
      source_asset_id: g.id,
      source_asset_title: g.guest_name ? `Guest submission by ${g.guest_name}` : "Approved guest submission",
      asset_url: g.image_url,
      storage_path: null,
    })),
  ].filter((item) => !!item.asset_url || !!item.storage_path);

  const deduped = new Map<string, AssetCandidate>();
  for (const item of mappedRaw) {
    const key = item.storage_path || item.asset_url || item.source_asset_id;
    const existing = deduped.get(key);
    if (!existing || item.source_priority < existing.source_priority) {
      deduped.set(key, item);
    }
  }
  const mapped = Array.from(deduped.values()).sort((a, b) => a.source_priority - b.source_priority);

  const summary = {
    priority_1: reusableAssets.length,
    priority_2: plannerAssets.length,
    priority_3: approvedLibraryAssets.length,
    priority_4: recentVenueUploads.length,
    priority_5: guestSubmissionAssets.length,
    eligible_total: mapped.length,
  };

  const recommendedNextActions = buildAssetRecommendations(summary);
  const usedCopyOnlyFallback = mapped.length === 0 && allowCopyOnlyFallback;
  const isAssetBlocked = mapped.length === 0 && !allowCopyOnlyFallback;
  const diagnosticMessage = buildAssetDiagnosticMessage(summary, usedCopyOnlyFallback, isAssetBlocked);

  return {
    assets: mapped.slice(0, Math.max(requestedCount, 1)),
    totalEligible: mapped.length,
    usedCopyOnlyFallback,
    isAssetBlocked,
    summary,
    diagnosticMessage,
    recommendedNextActions,
  };
}

function buildAssetRecommendations(summary: {
  priority_1: number;
  priority_2: number;
  priority_3: number;
  priority_4: number;
  priority_5: number;
  eligible_total: number;
}): string[] {
  const actions: string[] = [];
  if (summary.priority_1 === 0) actions.push("Mark at least 3 strong photos as reusable in the Autopilot asset pool");
  if (summary.priority_4 < 2) actions.push("Upload 3 dish photos");
  if (summary.priority_4 < 1) actions.push("Add 1 interior shot");
  if (summary.priority_5 === 0) actions.push("Approve guest photos for reuse");
  if (actions.length === 0 && summary.eligible_total < 3) actions.push("Add 2-3 more approved reusable assets for better variety");
  return actions.slice(0, 3);
}

function buildAssetDiagnosticMessage(
  summary: {
    priority_1: number;
    priority_2: number;
    priority_3: number;
    priority_4: number;
    priority_5: number;
    eligible_total: number;
  },
  usedCopyOnlyFallback: boolean,
  isAssetBlocked: boolean,
): string {
  const totals = `Asset coverage by priority: P1 ${summary.priority_1}, P2 ${summary.priority_2}, P3 ${summary.priority_3}, P4 ${summary.priority_4}, P5 ${summary.priority_5}.`;
  if (isAssetBlocked) return `${totals} No eligible assets found and copy-only fallback is disabled.`;
  if (usedCopyOnlyFallback) return `${totals} No eligible assets found, so Pulse generated copy-only drafts.`;
  return `${totals} Eligible assets found: ${summary.eligible_total}.`;
}

async function createNeedsAssetTaskRecommendation(supabase: any, venueId: string, recommendations: string[]) {
  const topActions = recommendations.length > 0 ? recommendations : ["Upload 3 dish photos", "Add 1 interior shot"];
  await supabase
    .from("action_feed_items")
    .upsert({
      venue_id: venueId,
      action_type: "autopilot_needs_assets",
      priority: "medium",
      title: "Autopilot needs more reusable visuals",
      description: topActions.join(" • "),
      cta_label: "Improve Asset Coverage",
      cta_route: "/autopilot",
      source_data: { recommendations: topActions },
      status: "open",
    }, { onConflict: "venue_id,action_type", ignoreDuplicates: false });
}

function buildAssetBrief(assets: any[]): string {
  if (!assets.length) return "No image assets available. Generate copy-only drafts with strong visual briefs.";
  return assets
    .map((asset, i) => `${i + 1}. ${asset.source_asset_title} [priority ${asset.source_priority}, ${asset.source}]`)
    .join("\n");
}

function buildDailyContentPrompt(ctx: any, count: number, assets: any[], mode: string): string {
  const today = new Date();
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];

  return `You are an expert hospitality social media manager.

VENUE CONTEXT:
${ctx.contextString}

TODAY: ${dayName}, ${today.toISOString().split("T")[0]}

Generate exactly ${count} social media content piece(s) for today.
Autopilot mode: ${mode}.

ELIGIBLE IMAGE SOURCES (highest priority first):
${buildAssetBrief(assets)}

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
- "source_asset_index": numeric index from the eligible source list when available

Return ONLY the JSON array.`;
}

function buildWeeklyCampaignPrompt(ctx: any, dailyCount: number, assets: any[], mode: string): string {
  const weekStart = new Date();
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return `You are an expert hospitality marketing strategist.

VENUE CONTEXT:
${ctx.contextString}

WEEK STARTING: ${weekStart.toISOString().split("T")[0]}

Create a 7-day content campaign plan. Generate ${dailyCount * 5} content pieces spread across the week.
Autopilot mode: ${mode}.

ELIGIBLE IMAGE SOURCES (highest priority first):
${buildAssetBrief(assets)}

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

function buildReviewContentPrompt(ctx: any, assets: any[], mode: string): string {
  return `You are an expert hospitality social strategist.

VENUE CONTEXT:
${ctx.contextString}
Autopilot mode: ${mode}.

ELIGIBLE IMAGE SOURCES (highest priority first):
${buildAssetBrief(assets)}

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
