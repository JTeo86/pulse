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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all venues with at least one enabled review source
    const { data: venues, error: vErr } = await supabaseAdmin
      .from("venues")
      .select("id, timezone");
    if (vErr) throw vErr;

    const { data: enabledSources } = await supabaseAdmin
      .from("review_sources")
      .select("venue_id")
      .eq("is_enabled", true);

    const venuesWithSources = new Set(enabledSources?.map(s => s.venue_id) || []);

    let processed = 0;
    let skipped = 0;

    for (const venue of (venues || [])) {
      if (!venuesWithSources.has(venue.id)) continue;

      // Check if local time is Monday 08:xx
      const tz = venue.timezone || "Europe/London";
      const now = new Date();
      const localStr = now.toLocaleString("en-US", { timeZone: tz });
      const localDate = new Date(localStr);
      const dayOfWeek = localDate.getDay(); // 0=Sun, 1=Mon
      const hour = localDate.getHours();

      if (dayOfWeek !== 1 || hour !== 8) continue;

      // Compute last week (Mon-Sun)
      const weekEnd = new Date(localDate);
      weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay()); // last Sunday
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6); // Monday before that

      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      // Idempotency guard
      const { data: existing } = await supabaseAdmin
        .from("review_automation_runs")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("week_start", weekStartStr)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Create automation run record
      const { data: run, error: runErr } = await supabaseAdmin
        .from("review_automation_runs")
        .insert({
          venue_id: venue.id,
          week_start: weekStartStr,
          week_end: weekEndStr,
          status: "running",
          steps_completed: [],
        })
        .select()
        .single();

      if (runErr) {
        console.error(`Failed to create automation run for venue ${venue.id}:`, runErr);
        continue;
      }

      const completedSteps: string[] = [];
      let hasError = false;
      let errorMsg = "";

      // Step 1: Ingest reviews (service-role call, no user auth needed)
      try {
        const ingestResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/ingest-reviews`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ venue_id: venue.id }),
          }
        );
        const ingestData = await ingestResp.json();
        if (ingestData.success || ingestData.fetched_count > 0) {
          completedSteps.push("ingest");
        } else {
          completedSteps.push("ingest_partial");
        }
      } catch (e) {
        hasError = true;
        errorMsg += `Ingest failed: ${e instanceof Error ? e.message : "unknown"}. `;
      }

      // Step 2: Generate weekly report
      try {
        const reportResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-weekly-review-report`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              venue_id: venue.id,
              week_start: weekStartStr,
              week_end: weekEndStr,
            }),
          }
        );
        const reportData = await reportResp.json();
        if (!reportData.error) {
          completedSteps.push("report");
        }
      } catch (e) {
        hasError = true;
        errorMsg += `Report failed: ${e instanceof Error ? e.message : "unknown"}. `;
      }

      // Step 3: Generate response tasks
      try {
        const triageResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-review-response-tasks`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              venue_id: venue.id,
              week_start: weekStartStr,
              week_end: weekEndStr,
            }),
          }
        );
        const triageData = await triageResp.json();
        if (!triageData.error) {
          completedSteps.push("triage");
        }
      } catch (e) {
        hasError = true;
        errorMsg += `Triage failed: ${e instanceof Error ? e.message : "unknown"}. `;
      }

      // Update run record
      await supabaseAdmin
        .from("review_automation_runs")
        .update({
          status: hasError ? "error" : "success",
          steps_completed: completedSteps,
          error_message: errorMsg || null,
        })
        .eq("id", run.id);

      processed++;
    }

    console.log(`Weekly reviews schedule: processed=${processed}, skipped=${skipped}`);

    return new Response(JSON.stringify({ processed, skipped }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("run-weekly-reviews-schedule error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
