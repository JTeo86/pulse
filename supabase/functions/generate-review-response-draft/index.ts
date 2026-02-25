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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { task_id, investigation_notes, strategy } = await req.json();
    if (!task_id) {
      return new Response(JSON.stringify({ error: "task_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user auth
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the task
    const { data: task, error: taskErr } = await supabaseAdmin
      .from("review_response_tasks")
      .select("*")
      .eq("id", task_id)
      .single();

    if (taskErr || !task) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await supabaseAdmin
      .from("venue_members")
      .select("role")
      .eq("venue_id", task.venue_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch venue name for context
    const { data: venue } = await supabaseAdmin
      .from("venues")
      .select("name")
      .eq("id", task.venue_id)
      .maybeSingle();

    const strategyMap: Record<string, string> = {
      apologise: "Apologise sincerely and explain what happened. Show empathy and commitment to improvement.",
      resolution: "Offer to resolve the issue offline. Provide contact details for direct follow-up.",
      defend: "Politely correct any misinformation while remaining professional and empathetic.",
      thank: "Thank the reviewer for their feedback and invite them to return.",
      neutral: "Acknowledge the feedback professionally. Keep the response neutral and compliance-safe.",
    };

    const strategyInstruction = strategyMap[strategy] || strategyMap.neutral;

    const systemPrompt = `You are a professional hospitality response writer for ${venue?.name || "a venue"}.

Write a public review response that:
1. ${strategyInstruction}
2. Is concise (2-4 sentences max)
3. Is warm but professional
4. Uses the venue's name naturally

STRICT RULES:
- NEVER admit liability or fault directly
- NEVER promise compensation, refunds, or specific remedies publicly
- NEVER share private details (booking info, staff names, internal processes)
- Move any sensitive resolution to offline contact: "We'd love to discuss this further — please contact us at..."
- Maintain brand reputation at all times

Return ONLY the response text, nothing else.`;

    const userMsg = `Review to respond to:
Source: ${task.source}
Rating: ${task.rating || "N/A"}/5
Author: ${task.author_name || "Anonymous"}
Review: ${task.review_text || "No text"}
AI triage reason: ${task.ai_reason || "N/A"}

${investigation_notes ? `Internal investigation notes (DO NOT share publicly, use to inform the tone):\n${investigation_notes}` : "No investigation notes provided."}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI draft error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const draftResponse = aiData.choices?.[0]?.message?.content?.trim();

    if (!draftResponse) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save draft to task
    await supabaseAdmin
      .from("review_response_tasks")
      .update({ draft_response: draftResponse })
      .eq("id", task_id);

    return new Response(JSON.stringify({ draft: draftResponse }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-review-response-draft error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
