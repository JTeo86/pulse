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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("authorization");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { venue_id, plan_id, mode } = body; // mode: 'suggest' | 'full'

    if (!venue_id || !plan_id) {
      return new Response(JSON.stringify({ error: "venue_id and plan_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get venue info
    const { data: venue } = await supabase
      .from("venues")
      .select("*")
      .eq("id", venue_id)
      .single();

    if (!venue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get plan info
    const { data: plan } = await supabase
      .from("venue_event_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (!plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get brand kit
    const { data: brandKit } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("venue_id", venue_id)
      .maybeSingle();

    const decision = plan.decision || {};

    const systemPrompt = `You are a hospitality marketing strategist for "${venue.name}".
Location: ${venue.city || "Unknown"}, ${venue.country_code || "GB"}.
Brand preset: ${brandKit?.preset || "casual"}.
Brand rules: ${brandKit?.rules_text || "None specified"}.

STRICT RULES:
- No fake discounts or invented claims
- No health claims or false scarcity
- If offer terms are missing, produce non-specific copy and flag tasks as "Needs details"
- All content must be commercially safe and credible

You MUST respond with valid JSON only, no markdown.`;

    const userPrompt = mode === "suggest"
      ? `Evaluate whether "${venue.name}" should run a campaign for this event:
Title: ${plan.title}
Date: ${plan.starts_at}
Category: ${plan.category || "general"}

Respond with ONLY this JSON:
{
  "recommendation": {
    "action": "plan" or "skip",
    "why": "brief rationale",
    "angles": ["angle1", "angle2"],
    "channels": ["instagram_post", "instagram_story", "email"]
  }
}`
      : `Create a full campaign plan for "${venue.name}" for this event:
Title: ${plan.title}
Date: ${plan.starts_at}
Category: ${plan.category || "general"}
Decisions: ${JSON.stringify(decision)}

Respond with ONLY this JSON:
{
  "recommendation": {"action":"plan","why":"...","angles":["..."],"channels":["instagram_post","instagram_story","email","sms"]},
  "plan": {"objective":"...","message_pillars":["..."],"timeline":["..."]},
  "tasks": [{"title":"...","sort_order":1}],
  "content_pack": {
    "content_items": [
      {"intent":"event","channel":"instagram_post","brief":"..."},
      {"intent":"event","channel":"instagram_story","brief":"..."}
    ],
    "copy_projects": [
      {"type":"email","brief":"..."}
    ]
  },
  "compliance_flags": []
}`;

    // Call AI via Lovable API
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", errText);
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown fences if present)
    let parsed;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      return new Response(
        JSON.stringify({ error: "Invalid AI response format", raw: rawContent }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store recommendation on the plan
    if (parsed.recommendation) {
      await supabase
        .from("venue_event_plans")
        .update({ ai_recommendation: parsed.recommendation })
        .eq("id", plan_id);
    }

    // For full mode, create tasks and content
    if (mode === "full" && parsed.tasks) {
      // Delete existing tasks and re-create
      await supabase.from("event_plan_tasks").delete().eq("plan_id", plan_id);

      const tasksToInsert = parsed.tasks.map((t: any, i: number) => ({
        plan_id,
        title: t.title,
        sort_order: t.sort_order ?? i,
        is_done: false,
      }));
      await supabase.from("event_plan_tasks").insert(tasksToInsert);
    }

    if (mode === "full" && parsed.content_pack) {
      // Create content_items
      if (parsed.content_pack.content_items?.length) {
        for (const ci of parsed.content_pack.content_items) {
          const { data: inserted } = await supabase
            .from("content_items")
            .insert({
              venue_id,
              intent: "event",
              status: "draft",
              asset_type: "static",
              caption_draft: ci.brief,
              change_reason: `Event: ${plan.title} - ${ci.channel}`,
            })
            .select("id")
            .single();

          if (inserted) {
            await supabase.from("event_plan_links").insert({
              plan_id,
              content_item_id: inserted.id,
              kind: "content_item",
            });
          }
        }
      }

      // Create copy_projects
      if (parsed.content_pack.copy_projects?.length) {
        for (const cp of parsed.content_pack.copy_projects) {
          const { data: inserted } = await supabase
            .from("copy_projects")
            .insert({
              venue_id,
              created_by: user.id,
              module: cp.type,
              goal: `Event campaign: ${plan.title}`,
              inputs: { brief: cp.brief, event_plan_id: plan_id },
            })
            .select("id")
            .single();

          if (inserted) {
            await supabase.from("event_plan_links").insert({
              plan_id,
              copy_project_id: inserted.id,
              kind: cp.type,
            });
          }
        }
      }

      // Update plan status
      await supabase
        .from("venue_event_plans")
        .update({ status: "planned" })
        .eq("id", plan_id);
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-event-plan error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
