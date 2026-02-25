import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──────────────────────────────────────────────────────────────

function safeDateToISO(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const d = new Date(String(raw));
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function detectGoogleIdKind(id: string): "place_id" | "data_id" | "unknown" {
  if (id.startsWith("ChIJ")) return "place_id";
  if (id.startsWith("0x") && id.includes(":")) return "data_id";
  return "unknown";
}

interface IngestionResult {
  success: boolean;
  fetched_count: number;
  warnings: string[];
  errors: string[];
  provider_meta: Record<string, unknown>;
}

// ── Google Maps Reviews via SerpAPI ──────────────────────────────────────

async function ingestGoogle(
  supabaseAdmin: ReturnType<typeof createClient>,
  venueId: string,
  source: { id: string; external_id: string; external_id_kind: string | null },
  apiKey: string
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const kind = source.external_id_kind || detectGoogleIdKind(source.external_id);
  let url: string;

  if (kind === "place_id") {
    url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(source.external_id)}&api_key=${apiKey}&sort_by=newestFirst&hl=en`;
  } else if (kind === "data_id") {
    url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${encodeURIComponent(source.external_id)}&api_key=${apiKey}&sort_by=newestFirst&hl=en`;
  } else {
    // Try place_id first, then data_id
    const detected = detectGoogleIdKind(source.external_id);
    if (detected === "place_id") {
      url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(source.external_id)}&api_key=${apiKey}&sort_by=newestFirst&hl=en`;
    } else if (detected === "data_id") {
      url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${encodeURIComponent(source.external_id)}&api_key=${apiKey}&sort_by=newestFirst&hl=en`;
    } else {
      errors.push(`Google source ${source.external_id}: cannot determine ID type. Expected ChIJ… (place_id) or 0x…:0x… (data_id).`);
      return { count, errors };
    }
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      errors.push(`SerpAPI error ${resp.status} for Google source ${source.external_id}: ${body.slice(0, 200)}`);
      return { count, errors };
    }
    const data = await resp.json();

    if (data.error) {
      errors.push(`SerpAPI error for Google: ${data.error}`);
      return { count, errors };
    }

    const reviews = data.reviews || [];
    for (const r of reviews) {
      try {
        const externalId = `google_${source.external_id}_${r.review_id || r.user?.name || ""}`;
        await supabaseAdmin.from("reviews").upsert({
          venue_id: venueId,
          source: "google",
          external_review_id: externalId,
          author_name: r.user?.name || "Anonymous",
          rating: r.rating || null,
          review_text: r.snippet || r.text || null,
          review_date: safeDateToISO(r.iso_date) || safeDateToISO(r.iso_date_of_last_edit) || safeDateToISO(r.date),
          raw_payload: r,
        }, { onConflict: "external_review_id" });
        count++;
      } catch (rowErr) {
        errors.push(`Google review parse error: ${rowErr instanceof Error ? rowErr.message : "unknown"}`);
      }
    }
  } catch (e) {
    errors.push(`Google ingestion error: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return { count, errors };
}

// ── OpenTable Reviews via SerpAPI ────────────────────────────────────────

async function ingestOpenTable(
  supabaseAdmin: ReturnType<typeof createClient>,
  venueId: string,
  source: { id: string; external_id: string; external_domain?: string | null },
  apiKey: string
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // external_id should be the rid (e.g. r/the-restaurant-name)
  const rid = source.external_id?.trim();
  if (!rid) {
    errors.push("OpenTable source missing rid. Please paste your OpenTable restaurant URL in Sources Setup to extract the rid.");
    return { count, errors };
  }
  let url = `https://serpapi.com/search.json?engine=open_table_reviews&rid=${encodeURIComponent(rid)}&api_key=${apiKey}`;
  // Pass domain for regional OpenTable sites (e.g. www.opentable.co.uk)
  const domain = source.external_domain?.trim();
  if (domain) {
    url += `&open_table_domain=${encodeURIComponent(domain)}`;
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      errors.push(`SerpAPI error ${resp.status} for OpenTable source: ${body.slice(0, 200)}`);
      return { count, errors };
    }
    const data = await resp.json();

    if (data.error) {
      let errMsg = `SerpAPI error for OpenTable: ${data.error}`;
      if (String(data.error).includes("hasn't returned any results")) {
        errMsg += ` — Check you're using the correct OpenTable domain (e.g., .co.uk vs .com).`;
      }
      errors.push(errMsg);
      return { count, errors };
    }

    const reviews = data.reviews || [];
    for (const r of reviews) {
      try {
        const externalId = `opentable_${rid}_${r.id || r.author || Math.random().toString(36).slice(2)}`;
        await supabaseAdmin.from("reviews").upsert({
          venue_id: venueId,
          source: "opentable",
          external_review_id: externalId,
          author_name: r.author || "Anonymous",
          rating: r.rating || r.overall_rating || null,
          review_text: r.text || r.comment || null,
          review_date: safeDateToISO(r.date),
          raw_payload: r,
        }, { onConflict: "external_review_id" });
        count++;
      } catch (rowErr) {
        errors.push(`OpenTable review parse error: ${rowErr instanceof Error ? rowErr.message : "unknown"}`);
      }
    }
  } catch (e) {
    errors.push(`OpenTable ingestion error: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return { count, errors };
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, errors: ["Unauthorized"] }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const venue_id = body?.venue_id;
    if (!venue_id || typeof venue_id !== "string") {
      return new Response(JSON.stringify({ success: false, errors: ["venue_id required"] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, errors: ["Unauthorized"] }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabaseAdmin
      .from("venue_members")
      .select("role")
      .eq("venue_id", venue_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ success: false, errors: ["Access denied: not a member of this venue"] }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get SerpAPI key
    const { data: apiKeys } = await supabaseAdmin
      .from("platform_api_keys")
      .select("key_name, key_value, is_configured")
      .eq("key_name", "SERPAPI_API_KEY")
      .single();

    const serpApiKey = apiKeys?.is_configured ? apiKeys?.key_value?.trim() : null;

    if (!serpApiKey) {
      const result: IngestionResult = {
        success: false,
        fetched_count: 0,
        warnings: [],
        errors: ["SERPAPI_API_KEY not configured in Platform Admin → Integrations & API Keys. Sign up at serpapi.com to get a key."],
        provider_meta: {},
      };
      // Log the run
      await supabaseAdmin.from("review_ingestion_runs").insert({
        venue_id,
        status: "error",
        fetched_count: 0,
        error_message: result.errors[0],
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch enabled sources
    const { data: sources, error: srcErr } = await supabaseAdmin
      .from("review_sources")
      .select("*")
      .eq("venue_id", venue_id)
      .eq("is_enabled", true);

    if (srcErr) {
      return new Response(JSON.stringify({ success: false, errors: [`Failed to fetch sources: ${srcErr.message}`] }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sources?.length) {
      const result: IngestionResult = {
        success: true,
        fetched_count: 0,
        warnings: ["No enabled review sources configured. Go to Sources Setup to add Google or OpenTable."],
        errors: [],
        provider_meta: {},
      };
      await supabaseAdmin.from("review_ingestion_runs").insert({
        venue_id,
        status: "warning",
        fetched_count: 0,
        error_message: result.warnings[0],
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalFetched = 0;
    const allWarnings: string[] = [];
    const allErrors: string[] = [];

    // Process Google sources
    const googleSources = sources.filter((s: any) => s.source === "google" || s.source === "google_maps");
    for (const src of googleSources) {
      const r = await ingestGoogle(supabaseAdmin, venue_id, src, serpApiKey);
      totalFetched += r.count;
      allErrors.push(...r.errors);

      await supabaseAdmin.from("review_ingestion_runs").insert({
        venue_id,
        source_id: src.id,
        status: r.errors.length ? "error" : "success",
        fetched_count: r.count,
        error_message: r.errors.length ? r.errors.join("; ") : null,
        raw_meta: { engine: "google_maps_reviews", external_id: src.external_id },
      });
    }

    // Process OpenTable sources
    const otSources = sources.filter((s: any) => s.source === "opentable");
    for (const src of otSources) {
      const r = await ingestOpenTable(supabaseAdmin, venue_id, src, serpApiKey);
      totalFetched += r.count;
      allErrors.push(...r.errors);

      await supabaseAdmin.from("review_ingestion_runs").insert({
        venue_id,
        source_id: src.id,
        status: r.errors.length ? "error" : "success",
        fetched_count: r.count,
        error_message: r.errors.length ? r.errors.join("; ") : null,
        raw_meta: { engine: "open_table_reviews", external_id: src.external_id },
      });
    }

    // Partial success: if some sources succeeded and some failed, it's a warning not full error
    const totalSources = googleSources.length + otSources.length;
    const hasAnySuccess = totalFetched > 0;
    const hasAnyError = allErrors.length > 0;

    const result: IngestionResult = {
      success: !hasAnyError || (hasAnySuccess && hasAnyError),
      fetched_count: totalFetched,
      warnings: hasAnySuccess && hasAnyError 
        ? [...allWarnings, "Some sources succeeded but others had errors. Check details below."]
        : allWarnings,
      errors: allErrors,
      provider_meta: {
        google_sources: googleSources.length,
        opentable_sources: otSources.length,
      },
    };

    console.log(`Ingested ${totalFetched} reviews for venue ${venue_id}. Errors: ${allErrors.length}`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("ingest-reviews error:", error);
    return new Response(JSON.stringify({
      success: false,
      fetched_count: 0,
      warnings: [],
      errors: [error instanceof Error ? error.message : "Unknown error"],
      provider_meta: {},
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
