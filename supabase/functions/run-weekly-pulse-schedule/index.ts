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

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    weekday: WEEKDAY_TO_INDEX[get("weekday") || "Mon"] ?? 1,
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
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(payload),
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  if (!response.ok || body?.error) {
    return { ok: false, error: body?.error || `HTTP ${response.status}` };
  }

  return { ok: true, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { data: venues, error: venuesError } = await supabaseAdmin
      .from("venues")
      .select("id, timezone");

    if (venuesError) throw venuesError;

    let processed = 0;
    let skipped = 0;

    for (const venue of venues || []) {
      const tz = venue.timezone || "Europe/London";
      const now = new Date();
      const cycle = getCompletedWeekRange(now, tz);

      if (cycle.localWeekday !== 1 || cycle.localHour !== 8) {
        continue;
      }

      const { data: existing } = await supabaseAdmin
        .from("venue_weekly_briefs")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("week_start", cycle.weekStart)
        .not("generated_at", "is", null)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const result = await invokeInternalStep("generate-weekly-report", {
        venue_id: venue.id,
        week_start: cycle.weekStart,
        week_end: cycle.weekEnd,
        send_email: true,
      });

      if (!result.ok) {
        console.error(`Weekly pulse report failed for venue ${venue.id}:`, result.error);
        continue;
      }

      processed++;
    }

    return new Response(JSON.stringify({ processed, skipped }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("run-weekly-pulse-schedule error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
