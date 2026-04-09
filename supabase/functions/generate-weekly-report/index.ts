import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, resolveModelForTask, chatCompletionsUrl } from "../_shared/ai-key-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type WeeklyPulseReport = {
  reputation_summary: string;
  content_summary: string;
  opportunities: string[];
  pulse_activity: string[];
  next_week_focus: string[];
};

function isoDate(value: Date) {
  return value.toISOString().split("T")[0];
}

function clampText(value: string | null | undefined, max = 280) {
  const text = (value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildOpportunityEngineOutput(input: {
  scheduledDates: string[];
  recentReviews: Array<{ review_text: string | null; rating: number | null }>;
}) {
  const now = new Date();
  const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const scheduled = input.scheduledDates
    .map((value) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter((value): value is Date => Boolean(value))
    .filter((value) => value >= now && value <= next14);

  const opportunities: string[] = [];
  const hasWeekend = scheduled.some((date) => date.getUTCDay() === 6 || date.getUTCDay() === 0);
  const hasFriday = scheduled.some((date) => date.getUTCDay() === 5);

  if (!hasFriday) opportunities.push("No Friday post is queued. Add one booking-focused post.");
  if (!hasWeekend) opportunities.push("Weekend visibility is thin. Schedule one Saturday or Sunday highlight.");
  if (scheduled.length < 3) opportunities.push(`Only ${scheduled.length} posts are planned for the next 14 days. Add 2 more.`);

  const lowRatingReviews = input.recentReviews.filter((r) => (r.rating ?? 5) <= 2).length;
  const highRatingReviews = input.recentReviews.filter((r) => (r.rating ?? 0) >= 4).length;

  if (lowRatingReviews >= 2) {
    opportunities.push("Recent low ratings mention service friction. Prioritize response speed and staffing checks.");
  }
  if (highRatingReviews >= 4) {
    opportunities.push("Guests are actively praising parts of the experience. Turn this into social proof content.");
  }

  return opportunities.slice(0, 5);
}

function buildHtmlEmail(venueName: string, weekStart: string, weekEnd: string, report: WeeklyPulseReport) {
  const renderList = (items: string[]) => items.map((item) => `<li style=\"margin:6px 0;\">${item}</li>`).join("");

  return `<!DOCTYPE html>
<html>
  <body style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5; margin: 0; background: #f8fafc;">
    <div style="max-width: 680px; margin: 0 auto; padding: 24px;">
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px;">
        <h1 style="font-size: 22px; margin: 0 0 4px 0;">Your weekly Pulse report</h1>
        <p style="margin: 0 0 16px 0; color: #6b7280;">${venueName} · ${weekStart} to ${weekEnd}</p>

        <h2 style="font-size: 16px; margin: 14px 0 6px 0;">What happened</h2>
        <p style="margin: 0 0 10px 0;">${report.reputation_summary}</p>

        <h2 style="font-size: 16px; margin: 14px 0 6px 0;">What matters</h2>
        <p style="margin: 0 0 10px 0;">${report.content_summary}</p>

        <h2 style="font-size: 16px; margin: 14px 0 6px 0;">Opportunities</h2>
        <ul style="margin: 0 0 10px 18px; padding: 0;">${renderList(report.opportunities)}</ul>

        <h2 style="font-size: 16px; margin: 14px 0 6px 0;">Pulse activity</h2>
        <ul style="margin: 0 0 10px 18px; padding: 0;">${renderList(report.pulse_activity)}</ul>

        <h2 style="font-size: 16px; margin: 14px 0 6px 0;">Next week focus</h2>
        <ul style="margin: 0 0 2px 18px; padding: 0;">${renderList(report.next_week_focus)}</ul>
      </div>
    </div>
  </body>
</html>`;
}

async function sendEmailIfConfigured(args: {
  recipients: string[];
  venueName: string;
  weekStart: string;
  weekEnd: string;
  report: WeeklyPulseReport;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("PULSE_FROM_EMAIL") || "Pulse <reports@pulse.local>";

  if (!resendKey || args.recipients.length === 0) {
    return { attempted: false, sent: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: args.recipients,
      subject: "Your weekly Pulse report",
      html: buildHtmlEmail(args.venueName, args.weekStart, args.weekEnd, args.report),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Failed to send weekly report email:", response.status, text);
    return { attempted: true, sent: false };
  }

  return { attempted: true, sent: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const isServiceRoleRequest = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string | null = null;
    if (!isServiceRoleRequest) {
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const body = await req.json();
    const {
      venue_id,
      week_start,
      week_end,
      send_email,
    } = body ?? {};

    if (!venue_id) {
      return new Response(JSON.stringify({ error: "Missing venue_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isServiceRoleRequest && userId) {
      const { data: isMember } = await supabaseAdmin.rpc("is_venue_member", {
        check_venue_id: venue_id,
        check_user_id: userId,
      });
      if (!isMember) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const now = new Date();
    const weekEndDate = week_end ? new Date(`${week_end}T00:00:00Z`) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekStartDate = week_start ? new Date(`${week_start}T00:00:00Z`) : new Date(weekEndDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const weekStart = isoDate(weekStartDate);
    const weekEnd = isoDate(weekEndDate);

    const [
      { data: venue },
      { data: reviewsByDate, error: reviewsError },
      { data: reviewsByCreated },
      { data: reviewTasks },
      { data: contentItems },
      { data: autopilotRuns },
      { data: members },
      { data: profiles },
    ] = await Promise.all([
      supabaseAdmin.from("venues").select("id, name, timezone").eq("id", venue_id).maybeSingle(),
      supabaseAdmin
        .from("reviews")
        .select("id, source, rating, review_text, author_name, review_date, created_at")
        .eq("venue_id", venue_id)
        .gte("review_date", weekStart)
        .lte("review_date", weekEnd)
        .order("review_date", { ascending: false })
        .limit(250),
      supabaseAdmin
        .from("reviews")
        .select("id, source, rating, review_text, author_name, review_date, created_at")
        .eq("venue_id", venue_id)
        .is("review_date", null)
        .gte("created_at", `${weekStart}T00:00:00Z`)
        .lte("created_at", `${weekEnd}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("review_response_tasks")
        .select("id, status, rating, ai_priority, review_text, created_at")
        .eq("venue_id", venue_id)
        .gte("created_at", `${weekStart}T00:00:00Z`)
        .lte("created_at", `${weekEnd}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(250),
      supabaseAdmin
        .from("content_items")
        .select("id, status, title, caption_draft, scheduled_for, created_at")
        .eq("venue_id", venue_id)
        .gte("created_at", `${weekStart}T00:00:00Z`)
        .lte("created_at", `${weekEnd}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(250),
      supabaseAdmin
        .from("autopilot_runs")
        .select("id, run_type, status, run_status, items_saved, saved_count, output_summary, created_at")
        .eq("venue_id", venue_id)
        .gte("created_at", `${weekStart}T00:00:00Z`)
        .lte("created_at", `${weekEnd}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("venue_members").select("user_id, role").eq("venue_id", venue_id),
      supabaseAdmin.from("user_profiles").select("user_id, email"),
    ]);

    if (reviewsError) {
      console.error("Failed to fetch reviews for weekly pulse report:", reviewsError);
      return new Response(JSON.stringify({ error: "Failed to fetch weekly signals" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reviewMap = new Map<string, any>();
    [...(reviewsByDate || []), ...(reviewsByCreated || [])].forEach((row) => {
      reviewMap.set(row.id, row);
    });
    const reviews = [...reviewMap.values()];

    const taskRows = reviewTasks || [];
    const contentRows = contentItems || [];
    const runRows = autopilotRuns || [];

    const ratingRows = reviews.filter((item) => item.rating !== null);
    const lowRatingCount = ratingRows.filter((review) => (review.rating ?? 5) <= 2).length;
    const highRatingCount = ratingRows.filter((review) => (review.rating ?? 0) >= 4).length;
    const avgRating = ratingRows.length > 0
      ? Number((ratingRows.reduce((sum, item) => sum + (item.rating || 0), 0) / ratingRows.length).toFixed(2))
      : null;

    const opportunitiesFromEngine = buildOpportunityEngineOutput({
      scheduledDates: contentRows
        .map((item) => item.scheduled_for)
        .filter((value): value is string => Boolean(value)),
      recentReviews: taskRows.map((task) => ({ review_text: task.review_text, rating: task.rating })),
    });

    const promptPayload = {
      venue_name: venue?.name || "Your venue",
      week_start: weekStart,
      week_end: weekEnd,
      metrics: {
        review_count: reviews.length,
        average_rating: avgRating,
        high_rating_count: highRatingCount,
        low_rating_count: lowRatingCount,
        review_tasks_total: taskRows.length,
        review_tasks_pending: taskRows.filter((task) => task.status === "pending").length,
        review_tasks_urgent: taskRows.filter((task) => task.ai_priority === "P1" || (task.rating ?? 5) <= 2).length,
        content_items_total: contentRows.length,
        content_ready_or_scheduled: contentRows.filter((item) => item.status === "ready" || item.status === "scheduled").length,
        content_drafts: contentRows.filter((item) => item.status === "draft").length,
        autopilot_runs_total: runRows.length,
        autopilot_successful: runRows.filter((run) => (run.run_status || run.status) === "completed").length,
      },
      reviews_sample: reviews.slice(0, 12).map((review) => ({
        source: review.source,
        rating: review.rating,
        text: clampText(review.review_text, 220),
        author: review.author_name,
      })),
      content_sample: contentRows.slice(0, 12).map((item) => ({
        status: item.status,
        title: clampText(item.title, 120),
        caption: clampText(item.caption_draft, 140),
        scheduled_for: item.scheduled_for,
      })),
      run_sample: runRows.slice(0, 10).map((run) => ({
        run_type: run.run_type,
        status: run.run_status || run.status,
        saved: run.saved_count || run.items_saved || 0,
        summary: clampText(run.output_summary, 140),
      })),
      opportunity_engine_outputs: opportunitiesFromEngine,
    };

    const aiConfig = await resolveAiConfig();

    const aiResponse = await fetch(chatCompletionsUrl(aiConfig), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveModelForTask("weekly_report", aiConfig),
        messages: [
          {
            role: "system",
            content:
              "You write a weekly management brief for a hospitality venue. Keep plain English. Keep short sentences. No technical language. No references to tools or AI. Always return JSON.",
          },
          {
            role: "user",
            content: `Create a concise weekly Pulse report. It must answer: what happened, what matters, and what to do next.\nReturn JSON with exact keys:\n{\n  \"reputation_summary\": \"string\",\n  \"content_summary\": \"string\",\n  \"opportunities\": [\"string\"],\n  \"pulse_activity\": [\"string\"],\n  \"next_week_focus\": [\"string\"]\n}\n\nData:\n${JSON.stringify(promptPayload, null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const text = await aiResponse.text();
      console.error("generate-weekly-report AI error:", aiResponse.status, text);
      return new Response(JSON.stringify({ error: "Failed to generate report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Empty report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let report = JSON.parse(content) as WeeklyPulseReport;
    report = {
      reputation_summary: report.reputation_summary || "No reputation updates were captured this week.",
      content_summary: report.content_summary || "Content activity was limited this week.",
      opportunities: Array.isArray(report.opportunities) ? report.opportunities.slice(0, 5) : [],
      pulse_activity: Array.isArray(report.pulse_activity) ? report.pulse_activity.slice(0, 5) : [],
      next_week_focus: Array.isArray(report.next_week_focus) ? report.next_week_focus.slice(0, 5) : [],
    };

    const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile.email]));
    const recipients = (members || [])
      .filter((member) => member.role === "admin" || member.role === "owner")
      .map((member) => profileMap.get(member.user_id))
      .filter((email): email is string => Boolean(email));

    const emailResult = send_email
      ? await sendEmailIfConfigured({
          recipients,
          venueName: venue?.name || "Your venue",
          weekStart,
          weekEnd,
          report,
        })
      : { attempted: false, sent: false };

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("venue_weekly_briefs")
      .upsert(
        {
          venue_id,
          week_start: weekStart,
          week_end: weekEnd,
          revenue_summary: report.reputation_summary,
          marketing_summary: report.content_summary,
          opportunities_detected: report.opportunities,
          recommended_actions: report.next_week_focus,
          pulse_report: report,
          pulse_activity: report.pulse_activity,
          generated_at: new Date().toISOString(),
          email_sent_at: emailResult.sent ? new Date().toISOString() : null,
        },
        { onConflict: "venue_id,week_start" }
      )
      .select("id, venue_id, week_start, week_end, generated_at, email_sent_at")
      .single();

    if (saveError) {
      console.error("Failed to save weekly pulse report:", saveError);
      return new Response(JSON.stringify({ error: "Failed to save report", report }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        report,
        saved,
        data_sources_used: [
          "reviews",
          "review_response_tasks",
          "content_items",
          "autopilot_runs",
          "opportunity_engine_outputs",
        ],
        email: emailResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-weekly-report error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
