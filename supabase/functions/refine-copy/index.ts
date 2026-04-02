import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, resolveModelForTask, chatCompletionsUrl } from '../_shared/ai-key-resolver.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefineCopyRequest {
  content: string;
  title?: string | null;
  refinement: string;
  module?: string;
}

const refinementPrompts: Record<string, string> = {
  shorter: "Make this copy more concise. Cut unnecessary words while keeping the core message and CTA intact.",
  more_premium: "Elevate the tone to feel more sophisticated and exclusive. Use refined language without being pretentious.",
  more_direct: "Make this more direct and action-oriented. Get to the point faster with a stronger CTA.",
  more_playful: "Add warmth and personality. Make it more engaging and fun while staying professional.",
  add_urgency: "Add genuine urgency without making false claims. Emphasize timeliness or limited nature if applicable.",
  more_urgent: "Make the message feel more time-sensitive. Emphasize the need to act now.",
  add_emojis: "Add 1-2 relevant emojis to make the message more engaging. Don't overdo it.",
};

const complianceRules = `
COMPLIANCE (STRICTLY FOLLOW):
- NEVER invent prices, discounts, or specific values
- NEVER make health/medical claims
- NEVER use "best", "guaranteed", "will sell out"
- NEVER create false urgency not in original
- Keep copy genuine and credible
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { content, title, refinement, module } = await req.json() as RefineCopyRequest;

    if (!content || !refinement) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refinementInstruction = refinementPrompts[refinement] || refinement;

    let moduleConstraint = "";
    if (module === "sms_push") {
      moduleConstraint = "IMPORTANT: Keep SMS messages under 160 characters. Push titles under 50 chars, bodies under 100 chars.";
    } else if (module === "ad_copy") {
      moduleConstraint = "IMPORTANT: Keep headlines under 40 characters. Primary text under 125 characters.";
    }

    const systemPrompt = `You are a hospitality copywriting expert. Refine the given copy according to the instruction.

${complianceRules}

${moduleConstraint}

Return JSON:
{
  "title": "refined title or null if not applicable",
  "content": "refined content"
}`;

    const userPrompt = `REFINEMENT INSTRUCTION: ${refinementInstruction}

ORIGINAL TITLE: ${title || "(none)"}
ORIGINAL CONTENT: ${content}

Apply the refinement while maintaining brand voice and compliance.`;

    console.log(`Refining copy with: ${refinement}`);

    let aiConfig;
    try {
      aiConfig = await resolveAiConfig();
    } catch {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch(chatCompletionsUrl(aiConfig), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveModelForTask('copy_refine', aiConfig),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", status, await aiResp.text().catch(() => ''));
      return new Response(JSON.stringify({ error: "Failed to refine copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '';

    if (!responseContent) {
      return new Response(JSON.stringify({ error: "Failed to refine copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    try {
      result = JSON.parse(responseContent);
    } catch {
      console.error("Failed to parse AI response:", responseContent);
      return new Response(JSON.stringify({ error: "Failed to parse refined copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Successfully refined copy");

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("refine-copy error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
