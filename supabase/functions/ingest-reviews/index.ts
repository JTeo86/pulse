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
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate venue_id from request body
    const body = await req.json();
    const venue_id = body?.venue_id;
    if (!venue_id || typeof venue_id !== "string") {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the authenticated user is a member of the requested venue
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check venue membership — prevents quota abuse across venues
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("venue_members")
      .select("role")
      .eq("venue_id", venue_id)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: "Access denied: not a member of this venue" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch API keys from platform_api_keys table
    const { data: apiKeys, error: keysError } = await supabaseAdmin
      .from("platform_api_keys")
      .select("key_name, key_value, is_configured")
      .in("key_name", ["SERPAPI_API_KEY", "APIFY_API_TOKEN"]);

    if (keysError) {
      console.error("Failed to fetch API keys:", keysError);
      return new Response(JSON.stringify({ error: "Failed to fetch API keys" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyMap: Record<string, string> = {};
    for (const k of apiKeys || []) {
      if (k.is_configured && k.key_value) keyMap[k.key_name] = k.key_value;
    }

    // Fetch enabled review sources for this venue
    const { data: sources, error: srcErr } = await supabaseAdmin
      .from("review_sources")
      .select("*")
      .eq("venue_id", venue_id)
      .eq("is_enabled", true);

    if (srcErr) {
      console.error("Failed to fetch review sources:", srcErr);
      return new Response(JSON.stringify({ error: "Failed to fetch review sources" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalIngested = 0;
    const errors: string[] = [];

    // Process Google reviews via SerpAPI
    const googleSources = (sources || []).filter(s => s.source === "google");
    if (googleSources.length > 0 && keyMap["SERPAPI_API_KEY"]) {
      for (const src of googleSources) {
        try {
          const url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(src.external_id)}&api_key=${keyMap["SERPAPI_API_KEY"]}&sort_by=newestFirst&hl=en`;
          const resp = await fetch(url);
          if (!resp.ok) {
            errors.push(`SerpAPI error for ${src.external_id}: ${resp.status}`);
            continue;
          }
          const data = await resp.json();
          const reviews = data.reviews || [];

          for (const r of reviews) {
            const externalId = `google_${src.external_id}_${r.review_id || r.user?.name || ''}`;
            await supabaseAdmin.from("reviews").upsert({
              venue_id,
              source: "google",
              external_review_id: externalId,
              author_name: r.user?.name || "Anonymous",
              rating: r.rating || null,
              review_text: r.snippet || r.text || null,
              review_date: r.date ? new Date(r.date).toISOString() : null,
              raw_payload: r,
            }, { onConflict: "external_review_id" });
            totalIngested++;
          }
        } catch (e) {
          errors.push(`Google ingestion error: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    } else if (googleSources.length > 0 && !keyMap["SERPAPI_API_KEY"]) {
      errors.push("SERPAPI_API_KEY not configured in Platform Admin → API Keys");
    }

    // Process OpenTable reviews via Apify
    const otSources = (sources || []).filter(s => s.source === "opentable");
    if (otSources.length > 0 && keyMap["APIFY_API_TOKEN"]) {
      for (const src of otSources) {
        try {
          // Start Apify actor run
          const runResp = await fetch(
            `https://api.apify.com/v2/acts/tripadvisor~scraper/runs?token=${keyMap["APIFY_API_TOKEN"]}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                startUrls: [{ url: src.external_id }],
                maxItems: 50,
              }),
            }
          );

          if (!runResp.ok) {
            errors.push(`Apify run error for OpenTable: ${runResp.status}`);
            continue;
          }

          const runData = await runResp.json();
          const datasetId = runData.data?.defaultDatasetId;

          if (!datasetId) {
            errors.push("No dataset ID from Apify run");
            continue;
          }

          // Wait a bit for the run to finish (simplified — production should poll)
          await new Promise(r => setTimeout(r, 10000));

          const itemsResp = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${keyMap["APIFY_API_TOKEN"]}`
          );

          if (!itemsResp.ok) {
            errors.push(`Apify dataset fetch error: ${itemsResp.status}`);
            continue;
          }

          const items = await itemsResp.json();
          for (const item of items) {
            const externalId = `opentable_${item.id || item.title || Math.random().toString(36)}`;
            await supabaseAdmin.from("reviews").upsert({
              venue_id,
              source: "opentable",
              external_review_id: externalId,
              author_name: item.user?.name || item.author || "Anonymous",
              rating: item.rating || item.stars || null,
              review_text: item.text || item.review || null,
              review_date: item.date ? new Date(item.date).toISOString() : null,
              raw_payload: item,
            }, { onConflict: "external_review_id" });
            totalIngested++;
          }
        } catch (e) {
          errors.push(`OpenTable ingestion error: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    } else if (otSources.length > 0 && !keyMap["APIFY_API_TOKEN"]) {
      errors.push("APIFY_API_TOKEN not configured in Platform Admin → API Keys");
    }

    console.log(`Ingested ${totalIngested} reviews for venue ${venue_id}. Errors: ${errors.length}`);

    return new Response(JSON.stringify({ ingested: totalIngested, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("ingest-reviews error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
