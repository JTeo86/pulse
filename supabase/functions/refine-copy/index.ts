import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefineCopyRequest {
  content: string;
  title?: string;
  refinement: 'shorter' | 'more_premium' | 'more_direct' | 'more_playful' | 'add_urgency';
}

const refinementInstructions: Record<string, string> = {
  shorter: "Make this copy more concise. Cut unnecessary words while preserving the key message and call to action. Aim to reduce length by 30-50%.",
  more_premium: "Elevate the tone to feel more luxurious and exclusive. Use sophisticated language, avoid casual expressions, and emphasize quality, craftsmanship, and exclusivity.",
  more_direct: "Make this copy more direct and action-oriented. Use shorter sentences, active voice, and clear imperatives. Get to the point faster.",
  more_playful: "Add more personality and warmth. Use friendlier language, clever wordplay if appropriate, and make it feel more conversational and engaging.",
  add_urgency: "Add a sense of urgency without being pushy. Emphasize limited time, limited availability, or time-sensitive benefits. Create FOMO tastefully.",
};

serve(async (req) => {
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

    const { content, title, refinement } = await req.json() as RefineCopyRequest;

    if (!content || !refinement) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instruction = refinementInstructions[refinement];
    if (!instruction) {
      return new Response(JSON.stringify({ error: "Invalid refinement type" }), {
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

    const systemPrompt = `You are an expert copywriter. Your task is to refine existing copy according to specific instructions while preserving the core message.

REFINEMENT INSTRUCTION:
${instruction}

OUTPUT FORMAT:
Return the refined copy in JSON format:
{
  "title": "refined title or null if no title was provided",
  "content": "refined content"
}

Keep the same general structure but apply the refinement. Do not add new information unless specifically asked.`;

    const userPrompt = `Please refine this copy:

${title ? `TITLE: ${title}\n\n` : ''}CONTENT:
${content}`;

    console.log(`Refining copy with: ${refinement}`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", status, errorText);
      return new Response(JSON.stringify({ error: "Failed to refine copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content;
    
    if (!responseContent) {
      return new Response(JSON.stringify({ error: "Failed to refine copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    try {
      result = JSON.parse(responseContent);
    } catch (e) {
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
