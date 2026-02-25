import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is platform admin
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminCheck } = await supabase.rpc("is_platform_admin", {
      check_user_id: user.id,
    });
    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: "Forbidden: platform admin only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Read key from platform_api_keys (same source as ingest-reviews)
    const { data: keyRow, error: keyError } = await supabase
      .from("platform_api_keys")
      .select("key_name, key_value, is_configured")
      .eq("key_name", "SERPAPI_API_KEY")
      .single();

    if (keyError || !keyRow) {
      return new Response(
        JSON.stringify({
          key_source: "db_platform_api_keys",
          key_found: false,
          key_length: 0,
          key_preview: null,
          serpapi_status: null,
          message:
            "SERPAPI_API_KEY row not found in platform_api_keys table.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rawValue = keyRow.key_value ?? "";
    const trimmedValue = rawValue.trim();

    if (!trimmedValue || !keyRow.is_configured) {
      return new Response(
        JSON.stringify({
          key_source: "db_platform_api_keys",
          key_found: false,
          key_length: rawValue.length,
          raw_length: rawValue.length,
          trimmed_length: trimmedValue.length,
          has_whitespace: rawValue !== trimmedValue,
          key_preview: null,
          serpapi_status: null,
          message: "Key is empty or not configured.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build masked preview
    const preview =
      trimmedValue.length > 8
        ? `${trimmedValue.slice(0, 4)}…${trimmedValue.slice(-4)}`
        : `${trimmedValue.slice(0, 2)}…`;

    // If there was whitespace, auto-fix it
    if (rawValue !== trimmedValue) {
      await supabase
        .from("platform_api_keys")
        .update({ key_value: trimmedValue })
        .eq("key_name", "SERPAPI_API_KEY");
    }

    // Test against SerpAPI with a minimal account info request
    let serpStatus: number | null = null;
    let serpMessage = "";
    try {
      const resp = await fetch(
        `https://serpapi.com/account.json?api_key=${encodeURIComponent(trimmedValue)}`
      );
      serpStatus = resp.status;
      if (resp.ok) {
        const data = await resp.json();
        serpMessage = `Account: ${data.plan_id || data.plan || "unknown plan"}, searches remaining: ${data.total_searches_left ?? "unknown"}`;
      } else {
        const body = await resp.text();
        serpMessage = `SerpAPI returned ${resp.status}: ${body.slice(0, 200)}`;
      }
    } catch (e) {
      serpMessage = `Connection error: ${e instanceof Error ? e.message : "unknown"}`;
    }

    // Update health status in platform_api_keys
    const healthStatus =
      serpStatus === 200 ? "healthy" : serpStatus === 401 ? "invalid" : serpStatus ? "invalid" : "untested";
    await supabase
      .from("platform_api_keys")
      .update({
        health_status: healthStatus,
        last_checked_at: new Date().toISOString(),
        last_error: healthStatus !== "healthy" ? serpMessage : null,
      })
      .eq("key_name", "SERPAPI_API_KEY");

    return new Response(
      JSON.stringify({
        key_source: "db_platform_api_keys",
        key_found: true,
        key_length: trimmedValue.length,
        key_preview: preview,
        had_whitespace: rawValue !== trimmedValue,
        serpapi_status: serpStatus,
        serpapi_message: serpMessage,
        health: healthStatus,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("test-serpapi-key error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
