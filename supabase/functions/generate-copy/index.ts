import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateCopyRequest {
  venue_id: string;
  module: 'email' | 'blog' | 'ad_copy' | 'sms_push';
  goal: string;
  inputs: {
    key_message: string;
    call_to_action: string;
    audience?: string;
    tone?: string;
    platform?: string;
    length?: 'short' | 'medium' | 'long';
  };
}

const moduleConfig = {
  email: {
    name: 'Email Campaign',
    format: 'subject line and body',
    lengthGuide: { short: '50-100 words', medium: '100-200 words', long: '200-400 words' }
  },
  blog: {
    name: 'Blog Post',
    format: 'title and full article',
    lengthGuide: { short: '300-500 words', medium: '500-800 words', long: '800-1200 words' }
  },
  ad_copy: {
    name: 'Ad Copy',
    format: 'headline and body copy',
    lengthGuide: { short: '25-50 words', medium: '50-100 words', long: '100-150 words' }
  },
  sms_push: {
    name: 'SMS/Push Notification',
    format: 'concise message',
    lengthGuide: { short: '50-80 characters', medium: '80-120 characters', long: '120-160 characters' }
  }
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { venue_id, module, goal, inputs } = await req.json() as GenerateCopyRequest;

    // Validate required fields
    if (!venue_id || !module || !goal || !inputs?.key_message || !inputs?.call_to_action) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch brand brief and identity from brand_kits
    const { data: brandKit } = await supabase
      .from("brand_kits")
      .select("preset, rules_text")
      .eq("venue_id", venue_id)
      .maybeSingle();

    // Fetch venue name for context
    const { data: venue } = await supabase
      .from("venues")
      .select("name")
      .eq("id", venue_id)
      .maybeSingle();

    const config = moduleConfig[module];
    const length = inputs.length || 'medium';
    const lengthGuide = config.lengthGuide[length];

    // Build brand context
    const brandContext = [];
    if (venue?.name) brandContext.push(`Business Name: ${venue.name}`);
    if (brandKit?.preset) brandContext.push(`Brand Tone Preset: ${brandKit.preset} (casual = friendly/approachable, midrange = professional/warm, luxury = sophisticated/exclusive)`);
    if (brandKit?.rules_text) brandContext.push(`Brand Voice Guidelines: ${brandKit.rules_text}`);
    if (inputs.tone) brandContext.push(`Requested Tone Override: ${inputs.tone}`);
    if (inputs.audience) brandContext.push(`Target Audience: ${inputs.audience}`);

    const systemPrompt = `You are an expert hospitality copywriter creating ${config.name} content. You write compelling, on-brand copy that drives action while maintaining brand consistency.

BRAND CONTEXT:
${brandContext.join('\n')}

OUTPUT FORMAT:
- Generate exactly 3 different variations
- Each variation should have a distinct angle/approach while staying on-brand
- Format as ${config.format}
- Target length: ${lengthGuide}
- Make the copy actionable and engaging
- No emojis unless the brand tone is casual
- Focus on benefits, not features

For each variation, return:
1. A catchy title/subject line (if applicable)
2. The main content

Respond in JSON format:
{
  "variations": [
    { "title": "string or null", "content": "string" },
    { "title": "string or null", "content": "string" },
    { "title": "string or null", "content": "string" }
  ]
}`;

    const userPrompt = `Generate ${config.name} content with the following details:

GOAL: ${goal}
KEY MESSAGE: ${inputs.key_message}
CALL TO ACTION: ${inputs.call_to_action}
${inputs.platform ? `PLATFORM: ${inputs.platform}` : ''}

Create 3 compelling variations that drive the desired action.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating ${module} copy for venue ${venue_id} with goal: ${goal}`);

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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Lovable settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", status, errorText);
      return new Response(JSON.stringify({ error: "Failed to generate copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content in AI response");
      return new Response(JSON.stringify({ error: "Failed to generate copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let variations;
    try {
      const parsed = JSON.parse(content);
      variations = parsed.variations;
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse generated copy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully generated ${variations.length} variations`);

    return new Response(JSON.stringify({ variations }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-copy error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
