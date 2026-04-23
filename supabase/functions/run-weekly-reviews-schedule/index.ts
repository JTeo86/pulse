import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-reviews-scheduler-secret",
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

const MONDAY_WINDOW_START_HOUR = 8;
const MONDAY_WINDOW_END_HOUR = 18;
const STALE_RUNNING_HOURS = 2;

type AdminClient = ReturnType<typeof createClient<any>>;

function createAdminClient(): AdminClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

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

function inMondayCatchupWindow(localWeekday: number, localHour: number) {
  return localWeekday === 1 && localHour >= MONDAY_WINDOW_START_HOUR && localHour <= MONDAY_WINDOW_END_HOUR;
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
    return { ok: false, error: typeof body === "string" ? body : body?.error || `HTTP ${response.status}`, body };
  }

  if (body?.error) {
    return { ok: false, error: body.error as string, body };
  }

  return { ok: true, body };
}

function isAuthorizedSchedulerRequest(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token && serviceRoleKey && token === serviceRoleKey) {
    return true;
  }

  const provided = req.headers.get("x-reviews-scheduler-secret")?.trim();
  const expected = Deno.env.get("REVIEWS_SCHEDULER_SECRET")?.trim();
  if (provided && expected && provided === expected) {
    return true;
  }

  return false;
}

async function runVenueCycle(
  supabaseAdmin: AdminClient,
  venue: { id: string; timezone?: string | null },
  now: Date,
  force = false,
) {
  const tz = venue.timezone || "Europe/London";
  const cycle = getCompletedWeekRange(now, tz);

  if (!force && !inMondayCatchupWindow(cycle.localWeekday, cycle.localHour)) {
    return { action: "outside_window" as const };
  }

  const weekStartStr = cycle.weekStart;
  const weekEndStr = cycle.weekEnd;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("review_automation_runs")
    .select("id, status, updated_at")
    .eq("venue_id", venue.id)
    .eq("week_start", weekStartStr)
    .maybeSingle();

  if (existingErr) {
    console.error(`Failed to check existing run for venue ${venue.id}:`, existingErr);
    return { action: "errored" as const, error: existingErr.message };
  }

  if (existing?.status === "success") {
    return { action: "already_success" as const };
  }

  const staleRunning = existing?.status === "running" && existing.updated_at
    ? (Date.now() - new Date(existing.updated_at).getTime()) > STALE_RUNNING_HOURS * 60 * 60 * 1000
    : false;

  if (existing?.status === "running" && !staleRunning) {
    return { action: "already_running" as const };
  }

  let runId = existing?.id as string | undefined;

  if (runId) {
    const { error: resetErr } = await supabaseAdmin
      .from("review_automation_runs")
      .update({
        status: "running",
        scheduled_for: now.toISOString(),
        steps_completed: [],
        error_message: staleRunning ? "Recovered stale running job and retried." : null,
      })
      .eq("id", runId);

    if (resetErr) {
      console.error(`Failed to reset run for venue ${venue.id}:`, resetErr);
      return { action: "errored" as const, error: resetErr.message };
    }
  } else {
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
      .select("id")
      .single();

    if (runErr || !run) {
      console.error(`Failed to create automation run for venue ${venue.id}:`, runErr);
      return { action: "errored" as const, error: runErr?.message || "Failed to create run" };
    }
    runId = run.id;
  }

  const completedSteps: string[] = [];
  const errors: string[] = [];

  const ingest = await invokeInternalStep("ingest-reviews", { venue_id: venue.id });
  if (ingest.ok) {
    completedSteps.push("ingest");
    const ingestCount = Number(ingest.body?.fetched_count || 0);
    if (ingestCount === 0) {
      completedSteps.push("ingest_no_new_reviews");
    }
  } else {
    errors.push(`Ingest failed: ${ingest.error}`);
  }

  const report = await invokeInternalStep("generate-weekly-review-report", {
    venue_id: venue.id,
    week_start: weekStartStr,
    week_end: weekEndStr,
  });
  if (report.ok) {
    if (report.body?.no_reviews) {
      completedSteps.push("report_no_reviews");
    } else {
      completedSteps.push("report");
    }
  } else {
    errors.push(`Report failed: ${report.error}`);
  }

  const triage = await invokeInternalStep("generate-review-response-tasks", {
    venue_id: venue.id,
    week_start: weekStartStr,
    week_end: weekEndStr,
  });
  if (triage.ok) {
    completedSteps.push("triage");
  } else {
    errors.push(`Triage failed: ${triage.error}`);
  }

  const finalStatus = errors.length === 0
    ? "success"
    : completedSteps.length > 0
      ? "partial"
      : "failed";

  await supabaseAdmin
    .from("review_automation_runs")
    .update({
      status: finalStatus,
      steps_completed: completedSteps,
      error_message: errors.length > 0 ? errors.join(" ") : null,
      scheduled_for: now.toISOString(),
    })
    .eq("id", runId!);

  return { action: "processed" as const, status: finalStatus, hadErrors: errors.length > 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createAdminClient();

    if (!isAuthorizedSchedulerRequest(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetVenueId: string | undefined = body?.venue_id;
    const force = Boolean(body?.force);

    const { data: venues, error: vErr } = await supabaseAdmin
      .from("venues")
      .select("id, timezone");
    if (vErr) throw vErr;

    const { data: enabledSources } = await supabaseAdmin
      .from("review_sources")
      .select("venue_id")
      .eq("is_enabled", true);

    const venuesWithSources = new Set(enabledSources?.map((s) => s.venue_id) || []);
    const candidates = (venues || []).filter((venue) => {
      const allowedBySource = venuesWithSources.has(venue.id);
      const allowedByTarget = targetVenueId ? venue.id === targetVenueId : true;
      return allowedBySource && allowedByTarget;
    });

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const venue of candidates) {
      const result = await runVenueCycle(supabaseAdmin, venue, new Date(), force);
      if (result.action === "processed") {
        processed++;
        if (result.hadErrors) failed++;
      } else if (result.action === "errored") {
        failed++;
      } else {
        skipped++;
      }
    }

    return new Response(JSON.stringify({ processed, skipped, failed, candidates: candidates.length }), {
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