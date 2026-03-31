import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getVenueLocalParts(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const weekday = WEEKDAY_TO_INDEX[get("weekday") || "Mon"] ?? 1;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    weekday,
  };
}

function getCompletedWeekRange(now: Date, timeZone: string) {
  const local = getVenueLocalParts(now, timeZone);
  const localDateUtc = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysSinceLastCompletedSunday = local.weekday === 0 ? 7 : local.weekday;

  const weekEndUtc = new Date(localDateUtc);
  weekEndUtc.setUTCDate(weekEndUtc.getUTCDate() - daysSinceLastCompletedSunday);

  const weekStartUtc = new Date(weekEndUtc);
  weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() - 6);

  return {
    weekStart: weekStartUtc.toISOString().split("T")[0],
    weekEnd: weekEndUtc.toISOString().split("T")[0],
    localWeekday: local.weekday,
    localHour: local.hour,
  };
}

async function invokeInternalStep(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(payload),
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  if (!response.ok) {
    return { ok: false, error: typeof body === "string" ? body : body?.error || `HTTP ${response.status}` };
  }

  if (body?.error) {
    return { ok: false, error: body.error as string };
  }

  return { ok: true, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth: require service role key (internal/cron only) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      const cycle = getCompletedWeekRange(now, tz);
      const dayOfWeek = cycle.localWeekday;
      const hour = cycle.localHour;

      if (dayOfWeek !== 1 || hour !== 8) continue;

      const weekStartStr = cycle.weekStart;
      const weekEndStr = cycle.weekEnd;

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
          scheduled_for: now.toISOString(),
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

      // Step 1: Ingest reviews
      try {
        const ingest = await invokeInternalStep("ingest-reviews", { venue_id: venue.id });
        if (ingest.ok && (ingest.body?.success || ingest.body?.fetched_count > 0)) {
          completedSteps.push("ingest");
        } else if (ingest.ok) {
          completedSteps.push("ingest_partial");
        } else {
          hasError = true;
          errorMsg += `Ingest failed: ${ingest.error}. `;
        }
      } catch (e) {
        hasError = true;
        errorMsg += `Ingest failed: ${e instanceof Error ? e.message : "unknown"}. `;
      }

      // Step 2: Generate weekly report
      try {
        const report = await invokeInternalStep("generate-weekly-review-report", {
          venue_id: venue.id,
          week_start: weekStartStr,
          week_end: weekEndStr,
        });
        if (report.ok) {
          completedSteps.push("report");
        } else {
          hasError = true;
          errorMsg += `Report failed: ${report.error}. `;
        }
      } catch (e) {
        hasError = true;
        errorMsg += `Report failed: ${e instanceof Error ? e.message : "unknown"}. `;
      }

      // Step 3: Generate response tasks
      try {
        const triage = await invokeInternalStep("generate-review-response-tasks", {
          venue_id: venue.id,
          week_start: weekStartStr,
          week_end: weekEndStr,
        });
        if (triage.ok) {
          completedSteps.push("triage");
        } else {
          hasError = true;
          errorMsg += `Triage failed: ${triage.error}. `;
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
