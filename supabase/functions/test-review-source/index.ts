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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { source_id } = body;
    if (!source_id) {
      return new Response(JSON.stringify({ success: false, error: "source_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load source
    const { data: source, error: srcErr } = await supabaseAdmin
      .from("review_sources")
      .select("*")
      .eq("id", source_id)
      .single();

    if (srcErr || !source) {
      return new Response(JSON.stringify({ success: false, error: "Source not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify venue access
    const { data: membership } = await supabaseAdmin
      .from("venue_members")
      .select("role")
      .eq("venue_id", source.venue_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "Access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({
        success: false,
        error_code: "SERPAPI_NOT_CONFIGURED",
        error: "SerpAPI key not configured. Go to Platform Admin → Integrations.",
        source_type: source.source,
        identifier: source.external_id,
        domain: source.external_domain,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Test the source
    const sourceType = source.source;
    let testUrl: string;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let reviewCount = 0;
    let reachable = false;
    const meta: Record<string, unknown> = {
      identifier: source.external_id,
      domain: source.external_domain,
    };

    if (sourceType === "google" || sourceType === "google_maps") {
      const kind = source.external_id_kind || (source.external_id.startsWith("ChIJ") ? "place_id" : source.external_id.startsWith("0x") ? "data_id" : "unknown");
      if (kind === "unknown") {
        return new Response(JSON.stringify({
          success: false, reachable: false,
          error_code: "GOOGLE_ID_UNKNOWN",
          error: `Cannot determine ID type for "${source.external_id}".`,
          source_type: sourceType, ...meta,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const param = kind === "place_id" ? "place_id" : "data_id";
      testUrl = `https://serpapi.com/search.json?engine=google_maps_reviews&${param}=${encodeURIComponent(source.external_id)}&api_key=${serpApiKey}&sort_by=newestFirst&hl=en`;
    } else if (sourceType === "opentable") {
      const rid = source.external_id?.trim();
      if (!rid) {
        return new Response(JSON.stringify({
          success: false, reachable: false,
          error_code: "OPENTABLE_RID_MISSING",
          error: "OpenTable restaurant path (rid) is missing.",
          source_type: sourceType, ...meta,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      testUrl = `https://serpapi.com/search.json?engine=open_table_reviews&rid=${encodeURIComponent(rid)}&api_key=${serpApiKey}`;
      if (source.external_domain?.trim()) {
        testUrl += `&open_table_domain=${encodeURIComponent(source.external_domain.trim())}`;
      }
    } else {
      return new Response(JSON.stringify({
        success: false,
        error_code: "UNSUPPORTED_SOURCE",
        error: `Source type "${sourceType}" is not supported for testing.`,
        source_type: sourceType, ...meta,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const resp = await fetch(testUrl);
      if (!resp.ok) {
        const b = await resp.text();
        errorCode = `${sourceType.toUpperCase()}_PROVIDER_ERROR`;
        errorMessage = `SerpAPI returned ${resp.status}: ${b.slice(0, 200)}`;
      } else {
        const data = await resp.json();
        if (data.error) {
          reachable = true;
          if (String(data.error).includes("hasn't returned any results")) {
            errorCode = `${sourceType.toUpperCase()}_NO_RESULTS`;
            errorMessage = sourceType === "opentable"
              ? `No results. Check the rid "${source.external_id}" and domain "${source.external_domain || 'opentable.com'}" are correct.`
              : `No results for this Google ID.`;
          } else {
            errorCode = `${sourceType.toUpperCase()}_PROVIDER_ERROR`;
            errorMessage = data.error;
          }
        } else {
          reachable = true;
          const reviews = data.reviews || [];
          reviewCount = reviews.length;
          meta.place_info = data.place_info || null;
          meta.search_metadata = data.search_metadata || null;
        }
      }
    } catch (e) {
      errorCode = `${sourceType.toUpperCase()}_NETWORK_ERROR`;
      errorMessage = e instanceof Error ? e.message : "Network error";
    }

    const testSuccess = reachable && !errorCode && reviewCount > 0;
    const testStatus = testSuccess ? "healthy" : errorCode ? "failed" : "warning";

    // Update source diagnostics
    await supabaseAdmin.from("review_sources").update({
      last_fetch_status: testStatus === "healthy" ? "success" : testStatus,
      last_error_code: errorCode,
      last_error_message: errorMessage,
      last_response_meta: meta,
    }).eq("id", source_id);

    return new Response(JSON.stringify({
      success: testSuccess,
      reachable,
      status: testStatus,
      review_count: reviewCount,
      error_code: errorCode,
      error: errorMessage,
      source_type: sourceType,
      identifier: source.external_id,
      domain: source.external_domain,
      meta,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("test-review-source error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
