import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ────────────────────────────────────────────────────────────────

interface SourceResult {
  source_id: string;
  source_type: string;
  status: "success" | "warning" | "failed";
  fetched_count: number;
  error_code: string | null;
  error_message: string | null;
  response_meta: Record<string, unknown>;
}

interface IngestionResult {
  success: boolean;
  fetched_count: number;
  warnings: string[];
  errors: string[];
  provider_meta: Record<string, unknown>;
  source_results: SourceResult[];
}

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

async function updateSourceDiagnostics(
  supabaseAdmin: ReturnType<typeof createClient>,
  sourceId: string,
  result: SourceResult
) {
  await supabaseAdmin.from("review_sources").update({
    last_ingested_at: new Date().toISOString(),
    last_fetch_status: result.status,
    last_fetch_count: result.fetched_count,
    last_error_code: result.error_code,
    last_error_message: result.error_message,
    last_response_meta: result.response_meta,
  }).eq("id", sourceId);
}

// ── Google Maps Reviews via SerpAPI ──────────────────────────────────────

async function ingestGoogle(
  supabaseAdmin: ReturnType<typeof createClient>,
  venueId: string,
  source: { id: string; external_id: string; external_id_kind: string | null },
  apiKey: string
): Promise<SourceResult> {
  const result: SourceResult = {
    source_id: source.id,
    source_type: "google",
    status: "success",
    fetched_count: 0,
    error_code: null,
    error_message: null,
    response_meta: {},
  };

  const kind = source.external_id_kind || detectGoogleIdKind(source.external_id);
  let url: string;

  if (kind === "place_id") {
    url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(source.external_id)}&api_key=${apiKey}&sort_by=newestFirst&hl=en`;
  } else if (kind === "data_id") {
    url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${encodeURIComponent(source.external_id)}&api_key=${apiKey}&sort_by=newestFirst&hl=en`;
  } else {
    result.status = "failed";
    result.error_code = "GOOGLE_ID_UNKNOWN";
    result.error_message = `Cannot determine ID type for ${source.external_id}. Expected ChIJ… (place_id) or 0x…:0x… (data_id).`;
    return result;
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      result.status = "failed";
      result.error_code = "GOOGLE_PROVIDER_ERROR";
      result.error_message = `SerpAPI error ${resp.status}: ${body.slice(0, 200)}`;
      return result;
    }
    const data = await resp.json();

    if (data.error) {
      result.status = "failed";
      result.error_code = "GOOGLE_PROVIDER_ERROR";
      result.error_message = `SerpAPI: ${data.error}`;
      return result;
    }

    result.response_meta = { place_info: data.place_info || null, search_metadata: data.search_metadata || null };

    const reviews = data.reviews || [];
    if (reviews.length === 0) {
      result.status = "warning";
      result.error_code = "GOOGLE_NO_RESULTS";
      result.error_message = "SerpAPI returned no Google reviews. Check the place ID is correct.";
    }

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
        result.fetched_count++;
      } catch (rowErr) {
        // individual row error, continue
      }
    }
  } catch (e) {
    result.status = "failed";
    result.error_code = "GOOGLE_NETWORK_ERROR";
    result.error_message = e instanceof Error ? e.message : "Unknown network error";
  }

  return result;
}

// ── OpenTable Reviews via SerpAPI ────────────────────────────────────────

async function ingestOpenTable(
  supabaseAdmin: ReturnType<typeof createClient>,
  venueId: string,
  source: { id: string; external_id: string; external_domain?: string | null },
  apiKey: string
): Promise<SourceResult> {
  const result: SourceResult = {
    source_id: source.id,
    source_type: "opentable",
    status: "success",
    fetched_count: 0,
    error_code: null,
    error_message: null,
    response_meta: {},
  };

  const rid = source.external_id?.trim();
  if (!rid) {
    result.status = "failed";
    result.error_code = "OPENTABLE_RID_MISSING";
    result.error_message = "OpenTable source is missing its restaurant path (rid). Go to Sources Setup → OpenTable and paste your OpenTable URL.";
    return result;
  }

  let url = `https://serpapi.com/search.json?engine=open_table_reviews&rid=${encodeURIComponent(rid)}&api_key=${apiKey}`;
  const domain = source.external_domain?.trim();
  if (domain) {
    url += `&open_table_domain=${encodeURIComponent(domain)}`;
    result.response_meta.domain_used = domain;
  } else {
    result.response_meta.domain_used = "opentable.com (default)";
  }
  result.response_meta.rid_used = rid;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      result.status = "failed";
      result.error_code = "OPENTABLE_PROVIDER_ERROR";
      result.error_message = `SerpAPI error ${resp.status}: ${body.slice(0, 200)}`;
      return result;
    }
    const data = await resp.json();

    if (data.error) {
      result.status = "failed";
      if (String(data.error).includes("hasn't returned any results")) {
        result.error_code = "OPENTABLE_NO_RESULTS";
        result.error_message = `No results from OpenTable. The rid "${rid}" with domain "${domain || 'opentable.com'}" returned nothing. Check the restaurant path and regional domain are correct.`;
      } else {
        result.error_code = "OPENTABLE_PROVIDER_ERROR";
        result.error_message = `SerpAPI: ${data.error}`;
      }
      return result;
    }

    result.response_meta.search_metadata = data.search_metadata || null;

    const reviews = data.reviews || [];
    if (reviews.length === 0) {
      result.status = "warning";
      result.error_code = "OPENTABLE_NO_RESULTS";
      result.error_message = `OpenTable responded but returned 0 reviews for rid "${rid}" on domain "${domain || 'opentable.com'}". Verify the URL and domain match your listing.`;
    }

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
        result.fetched_count++;
      } catch (rowErr) {
        // individual row error, continue
      }
    }
  } catch (e) {
    result.status = "failed";
    result.error_code = "OPENTABLE_NETWORK_ERROR";
    result.error_message = e instanceof Error ? e.message : "Unknown network error";
  }

  return result;
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, errors: ["Unauthorized"], source_results: [] }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const venue_id = body?.venue_id;
    if (!venue_id || typeof venue_id !== "string") {
      return new Response(JSON.stringify({ success: false, errors: ["venue_id required"], source_results: [] }), {
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
      return new Response(JSON.stringify({ success: false, errors: ["Unauthorized"], source_results: [] }), {
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
      return new Response(JSON.stringify({ success: false, errors: ["Access denied"], source_results: [] }), {
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
        errors: ["SERPAPI_API_KEY not configured in Platform Admin → Integrations & API Keys."],
        provider_meta: {},
        source_results: [],
      };
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
      return new Response(JSON.stringify({ success: false, errors: [`Failed to fetch sources: ${srcErr.message}`], source_results: [] }), {
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
        source_results: [],
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

    const sourceResults: SourceResult[] = [];

    // Process Google sources
    const googleSources = sources.filter((s: any) => s.source === "google" || s.source === "google_maps");
    for (const src of googleSources) {
      const r = await ingestGoogle(supabaseAdmin, venue_id, src, serpApiKey);
      sourceResults.push(r);

      await updateSourceDiagnostics(supabaseAdmin, src.id, r);

      await supabaseAdmin.from("review_ingestion_runs").insert({
        venue_id,
        source_id: src.id,
        status: r.status === "success" ? "success" : r.status === "warning" ? "warning" : "error",
        fetched_count: r.fetched_count,
        error_message: r.error_message,
        raw_meta: { engine: "google_maps_reviews", external_id: src.external_id, error_code: r.error_code },
      });
    }

    // Process OpenTable sources
    const otSources = sources.filter((s: any) => s.source === "opentable");
    for (const src of otSources) {
      const r = await ingestOpenTable(supabaseAdmin, venue_id, src, serpApiKey);
      sourceResults.push(r);

      await updateSourceDiagnostics(supabaseAdmin, src.id, r);

      await supabaseAdmin.from("review_ingestion_runs").insert({
        venue_id,
        source_id: src.id,
        status: r.status === "success" ? "success" : r.status === "warning" ? "warning" : "error",
        fetched_count: r.fetched_count,
        error_message: r.error_message,
        raw_meta: { engine: "open_table_reviews", external_id: src.external_id, error_code: r.error_code },
      });
    }

    const totalFetched = sourceResults.reduce((s, r) => s + r.fetched_count, 0);
    const allErrors = sourceResults.filter(r => r.status === "failed").map(r => r.error_message!).filter(Boolean);
    const allWarnings = sourceResults.filter(r => r.status === "warning").map(r => r.error_message!).filter(Boolean);

    const result: IngestionResult = {
      success: allErrors.length === 0,
      fetched_count: totalFetched,
      warnings: allWarnings,
      errors: allErrors,
      provider_meta: {
        google_sources: googleSources.length,
        opentable_sources: otSources.length,
      },
      source_results: sourceResults,
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
      source_results: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
