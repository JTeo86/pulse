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
  preset?: string | null;
  inputs: {
    key_message: string;
    call_to_action: string;
    audience?: string;
    tone?: string;
    platform?: string;
    length?: 'short' | 'medium' | 'long';
    preset_context?: string;
    urgency?: string;
  };
}

const moduleConfig = {
  email: {
    name: 'Email Campaign',
    format: `Return JSON with this exact structure:
{
  "variations": [
    {
      "title": "Subject line here",
      "content": "Full email body with greeting, main message, and sign-off"
    }
  ]
}`,
    lengthGuide: { short: '50-100 words', medium: '100-200 words', long: '200-400 words' },
    outputHints: 'Include subject line as title. Body should have greeting, main message, CTA, and sign-off.',
  },
  blog: {
    name: 'Blog Post',
    format: `Return JSON with this exact structure:
{
  "variations": [
    {
      "title": "Blog post title here",
      "content": "Full article with introduction, body paragraphs with subheadings (use ## for H2), and conclusion"
    }
  ]
}`,
    lengthGuide: { short: '300-500 words', medium: '500-800 words', long: '800-1200 words' },
    outputHints: 'Include SEO-friendly title. Content should have intro, structured body with H2 headings (##), and conclusion.',
  },
  ad_copy: {
    name: 'Ad Copy',
    format: `Return JSON with this exact structure:
{
  "variations": [
    {
      "title": "Headline (max 40 chars for Meta, 30 for Google)",
      "content": "Primary text / description (keep under 125 chars for Meta)"
    }
  ]
}`,
    lengthGuide: { short: '25-50 words', medium: '50-100 words', long: '100-150 words' },
    outputHints: 'Headline in title field. Primary text in content. Keep within platform character limits.',
  },
  sms_push: {
    name: 'SMS/Push Notification',
    format: `Return JSON with this exact structure:
{
  "variations": [
    {
      "title": "Push notification title (optional, for push only)",
      "content": "SMS/Push message body - keep under 160 chars for SMS"
    }
  ]
}`,
    lengthGuide: { short: '50-80 characters', medium: '80-120 characters', long: '120-160 characters' },
    outputHints: 'For SMS: no title, message under 160 chars. For Push: short title + body.',
  },
};

// Compliance rules - CRITICAL for hospitality
const complianceRules = `
COMPLIANCE RULES (STRICTLY FOLLOW):
1. NEVER invent prices, discounts, percentages, or specific monetary values
2. NEVER make health, medical, or nutritional claims
3. NEVER use superlatives like "best", "number one", "guaranteed", "will sell out"
4. NEVER create false urgency unless explicitly provided by the user
5. NEVER invent dates, times, or availability claims not provided by user
6. NEVER make legal, financial, or regulated advice statements
7. If specific details are missing, write flexible, non-specific copy
8. Avoid clichés and hyperbole - be genuine and credible
9. Focus on experience and atmosphere, not unverifiable claims
`;

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

    const { venue_id, module, goal, preset, inputs } = await req.json() as GenerateCopyRequest;

    if (!venue_id || !module || !goal || !inputs?.key_message || !inputs?.call_to_action) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch brand brief and identity
    const { data: brandKit } = await supabase
      .from("brand_kits")
      .select("preset, rules_text")
      .eq("venue_id", venue_id)
      .maybeSingle();

    const { data: venue } = await supabase
      .from("venues")
      .select("name")
      .eq("id", venue_id)
      .maybeSingle();

    const config = moduleConfig[module];
    const length = inputs.length || 'medium';
    const lengthGuide = config.lengthGuide[length];

    // Build brand context
    const brandContext: string[] = [];
    if (venue?.name) brandContext.push(`Business: ${venue.name}`);
    
    // Map preset to tone description
    const toneMap: Record<string, string> = {
      casual: 'friendly, approachable, conversational',
      midrange: 'professional yet warm, balanced',
      luxury: 'sophisticated, exclusive, refined',
    };
    
    if (brandKit?.preset && toneMap[brandKit.preset]) {
      brandContext.push(`Brand Tone: ${toneMap[brandKit.preset]}`);
    }
    if (brandKit?.rules_text) {
      brandContext.push(`Brand Voice Guidelines: ${brandKit.rules_text}`);
    }
    if (inputs.tone) {
      brandContext.push(`Requested Tone: ${inputs.tone}`);
    }
    if (inputs.audience) {
      brandContext.push(`Target Audience: ${inputs.audience}`);
    }
    if (inputs.urgency && inputs.urgency !== 'none') {
      brandContext.push(`Urgency Level: ${inputs.urgency}`);
    }
    if (inputs.preset_context) {
      brandContext.push(`Context: ${inputs.preset_context}`);
    }

    const systemPrompt = `You are a senior hospitality copywriter specializing in ${config.name} content.

BRAND CONTEXT:
${brandContext.join('\n')}

${complianceRules}

OUTPUT REQUIREMENTS:
- Generate exactly 3 different variations
- Each variation should take a distinct angle while staying on-brand
- Target length: ${lengthGuide}
- ${config.outputHints}
- Make copy actionable and engaging
- No emojis unless tone is casual/playful or module is SMS
- Focus on experience and benefits, not unverifiable claims

${config.format}`;

    const userPrompt = `Create ${config.name} content for:

GOAL: ${goal}
${preset ? `PRESET: ${preset}` : ''}
KEY MESSAGE: ${inputs.key_message}
CALL TO ACTION: ${inputs.call_to_action}
${inputs.platform ? `PLATFORM: ${inputs.platform}` : ''}

Generate 3 compelling, compliant variations.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating ${module} copy for venue ${venue_id}, goal: ${goal}, preset: ${preset || 'none'}`);

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
