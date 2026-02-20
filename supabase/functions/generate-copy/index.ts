import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json();
    const { venue_id, module, goal, opportunity, inputs } = body;

    if (!venue_id || !module || !goal || !inputs?.key_message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch brand context
    const [{ data: brandKit }, { data: venue }] = await Promise.all([
      supabase.from("brand_kits").select("preset, rules_text").eq("venue_id", venue_id).maybeSingle(),
      supabase.from("venues").select("name").eq("id", venue_id).maybeSingle(),
    ]);

    const toneMap: Record<string, string> = {
      casual: "friendly, approachable, conversational",
      midrange: "professional yet warm, balanced",
      luxury: "sophisticated, exclusive, refined",
    };

    const brandContext: string[] = [];
    const contextUsed: string[] = [];
    if (venue?.name) {
      brandContext.push(`Business: ${venue.name}`);
      contextUsed.push(`Brand: ${venue.name}`);
    }
    if (brandKit?.preset && toneMap[brandKit.preset]) {
      brandContext.push(`Brand Tone: ${toneMap[brandKit.preset]}`);
      contextUsed.push(`Tone: ${toneMap[brandKit.preset]}`);
    }
    if (brandKit?.rules_text) {
      brandContext.push(`Brand Voice Guidelines: ${brandKit.rules_text}`);
      contextUsed.push("Brand voice rules applied");
    }
    if (inputs.secondary_focus?.length) {
      brandContext.push(`Secondary Focus: ${inputs.secondary_focus.join(", ")}`);
      contextUsed.push(...inputs.secondary_focus.map((f: string) => f.replace(/_/g, " ")));
    }
    if (opportunity && opportunity.label && opportunity.label !== "General Campaign") {
      brandContext.push(`Campaign Opportunity: ${opportunity.label}${opportunity.meta ? ` (${opportunity.meta})` : ""}`);
      contextUsed.push(`Opportunity: ${opportunity.label}`);
    }

    // Campaign mode — generate full kit
    if (module === "campaign") {
      const systemPrompt = `You are a senior hospitality marketing strategist and copywriter.

BRAND CONTEXT:
${brandContext.join("\n")}

${complianceRules}

You will produce a complete, structured Campaign Kit as JSON. Every asset should be immediately usable, on-brand, and compliant.

Return EXACTLY this JSON structure:
{
  "kit": {
    "strategy": {
      "objective": "One-line campaign objective statement",
      "offerFraming": "How the offer/experience is framed",
      "ctaPositioning": "CTA approach and reasoning"
    },
    "assets": {
      "email": {
        "subject": "Email subject line (under 50 chars)",
        "preview": "Email preview text (under 90 chars)",
        "body": "Full email body with greeting, value proposition, CTA and sign-off"
      },
      "instagram": "Instagram caption (2-4 sentences, one CTA, no hashtags unless organic)",
      "sms": "SMS message (under 160 characters)",
      "websiteBanner": "Website banner headline and subline (2 lines)",
      "staffBriefing": "Internal staff summary: what the campaign is about, key talking points, and how to upsell or support it",
      "visualDirection": "Suggested visual direction: mood, shot type, colour palette cues, styling notes"
    },
    "contextUsed": ${JSON.stringify(contextUsed)},
    "performanceInsights": [
      "Insight about why this campaign approach works",
      "Another strategic or psychological insight",
      "Third insight about brand alignment or timing"
    ]
  }
}`;

      const userPrompt = `Create a full Campaign Kit for:

PRIMARY OBJECTIVE: ${goal}
KEY MESSAGE: ${inputs.key_message}
CALL TO ACTION: ${inputs.call_to_action}
OPPORTUNITY: ${inputs.opportunity_label || "General Campaign"}

Generate a complete, professional, compliant campaign kit.`;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "AI service not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Generating campaign kit for venue ${venue_id}, goal: ${goal}`);

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
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const errorText = await aiResponse.text();
        console.error("AI gateway error:", status, errorText);
        return new Response(JSON.stringify({ error: "Failed to generate campaign kit" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;
      if (!content) return new Response(JSON.stringify({ error: "No content returned" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse campaign kit" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Ensure contextUsed is injected
      if (parsed.kit) {
        parsed.kit.contextUsed = contextUsed;
      }

      console.log("Campaign kit generated successfully");
      return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Legacy single-module mode (email, blog, ad_copy, sms_push)
    const moduleConfig: Record<string, any> = {
      email: {
        name: "Email Campaign",
        format: `{"variations":[{"title":"Subject line","content":"Full email body"}]}`,
        lengthGuide: { short: "50-100 words", medium: "100-200 words", long: "200-400 words" },
      },
      blog: {
        name: "Blog Post",
        format: `{"variations":[{"title":"Blog title","content":"Full article"}]}`,
        lengthGuide: { short: "300-500 words", medium: "500-800 words", long: "800-1200 words" },
      },
      ad_copy: {
        name: "Ad Copy",
        format: `{"variations":[{"title":"Headline","content":"Primary text"}]}`,
        lengthGuide: { short: "25-50 words", medium: "50-100 words", long: "100-150 words" },
      },
      sms_push: {
        name: "SMS/Push Notification",
        format: `{"variations":[{"title":"Push title","content":"Message body"}]}`,
        lengthGuide: { short: "50-80 chars", medium: "80-120 chars", long: "120-160 chars" },
      },
    };

    const config = moduleConfig[module];
    if (!config) return new Response(JSON.stringify({ error: "Unknown module" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const length = inputs.length || "medium";
    const systemPrompt = `You are a senior hospitality copywriter.\n\nBRAND CONTEXT:\n${brandContext.join("\n")}\n\n${complianceRules}\n\nGenerate exactly 3 variations. Format: ${config.format}\nTarget length: ${config.lengthGuide[length]}`;
    const userPrompt = `Create ${config.name} for:\nGOAL: ${goal}\nKEY MESSAGE: ${inputs.key_message}\nCTA: ${inputs.call_to_action}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) return new Response(JSON.stringify({ error: "Failed to generate copy" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) return new Response(JSON.stringify({ error: "No content returned" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (error) {
    console.error("generate-copy error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
