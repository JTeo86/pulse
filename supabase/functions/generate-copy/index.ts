import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // User-scoped client for auth checks
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service-role client for persistence (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { venue_id, module, goal, opportunity, inputs } = body;

    // Campaign mode has different required fields
    if (module === "campaign") {
      if (!venue_id || !goal) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!venue_id || !module || !goal || !inputs?.key_message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const userId = claimsData.claims.sub as string;
    const { data: isMember } = await supabaseAdmin.rpc("is_venue_member", {
      check_venue_id: venue_id,
      check_user_id: userId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a member of this venue" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch brand context
    const [{ data: brandKit }, { data: venue }, { data: styleProfile }] = await Promise.all([
      supabaseAdmin.from("brand_kits").select("preset, rules_text").eq("venue_id", venue_id).maybeSingle(),
      supabaseAdmin.from("venues").select("name").eq("id", venue_id).maybeSingle(),
      supabaseAdmin.from("venue_style_profiles").select("cuisine_type, venue_tone, brand_summary, target_audience, key_selling_points").eq("venue_id", venue_id).maybeSingle(),
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
    if (styleProfile?.cuisine_type) {
      brandContext.push(`Cuisine: ${styleProfile.cuisine_type}`);
      contextUsed.push(`Cuisine: ${styleProfile.cuisine_type}`);
    }
    if (styleProfile?.venue_tone) {
      brandContext.push(`Brand Tone: ${styleProfile.venue_tone}`);
      contextUsed.push(`Tone: ${styleProfile.venue_tone}`);
    } else if (brandKit?.preset && toneMap[brandKit.preset]) {
      brandContext.push(`Brand Tone: ${toneMap[brandKit.preset]}`);
      contextUsed.push(`Tone: ${toneMap[brandKit.preset]}`);
    }
    if (styleProfile?.brand_summary) {
      brandContext.push(`Brand Summary: ${styleProfile.brand_summary}`);
      contextUsed.push("Brand summary applied");
    }
    if (styleProfile?.target_audience) {
      brandContext.push(`Target Audience: ${styleProfile.target_audience}`);
    }
    if (styleProfile?.key_selling_points) {
      brandContext.push(`Key Selling Points: ${styleProfile.key_selling_points}`);
    }
    if (brandKit?.rules_text) {
      brandContext.push(`Brand Voice Guidelines: ${brandKit.rules_text}`);
      contextUsed.push("Brand voice rules applied");
    }
    if (inputs?.secondary_focus?.length) {
      brandContext.push(`Secondary Focus: ${inputs.secondary_focus.join(", ")}`);
      contextUsed.push(...inputs.secondary_focus.map((f: string) => f.replace(/_/g, " ")));
    }
    if (opportunity?.label && opportunity.label !== "General Campaign") {
      brandContext.push(`Campaign Opportunity: ${opportunity.label}${opportunity.meta ? ` (${opportunity.meta})` : ""}`);
      contextUsed.push(`Opportunity: ${opportunity.label}`);
    }

    // ═══════════════════════════════════════════════════
    // CAMPAIGN MODE — Canonical Campaign Pack
    // ═══════════════════════════════════════════════════
    if (module === "campaign") {
      const strategy = inputs?.plan_strategy || {};
      const brainContext = inputs?.brain_context || "";
      const planTitle = inputs?.plan_title || goal;

      const systemPrompt = `You are a senior hospitality marketing strategist and copywriter.

BRAND CONTEXT:
${brandContext.join("\n")}

${complianceRules}

You will produce a complete, structured Campaign Pack as JSON.
Every asset should be immediately usable, on-brand, and compliant.

Return EXACTLY this JSON structure:
{
  "campaign_pack": {
    "copy": {
      "instagram_caption": "Full Instagram caption (2-4 sentences, one CTA, no hashtags unless organic)",
      "short_caption": "Short punchy version (1-2 sentences max)",
      "story_text": "Instagram Story text overlay (brief, impactful, under 20 words)",
      "reel_hook": "Opening hook line for a reel (attention-grabbing, under 10 words)",
      "promo_headline": "Promotional headline for website/poster",
      "call_to_action": "Clear, specific CTA",
      "sms_push_notification": "SMS/push message (under 160 characters)",
      "email_subject": "Email subject line (under 50 chars)",
      "email_preview": "Email preview text (under 90 chars)",
      "email_body": "Full email body with greeting, value proposition, CTA and sign-off"
    },
    "production": {
      "visual_direction": "Detailed visual direction: mood, shot types, colour palette, styling notes, props",
      "asset_briefs": [
        {
          "asset_type": "hero_image",
          "title": "Hero Campaign Image",
          "brief": "Detailed creative brief for the hero image",
          "intended_channel": "Instagram Feed"
        },
        {
          "asset_type": "reel",
          "title": "Campaign Reel",
          "brief": "Detailed brief for the campaign reel",
          "intended_channel": "Instagram Reels / TikTok"
        },
        {
          "asset_type": "story_visual",
          "title": "Story Visual",
          "brief": "Detailed brief for the story visual",
          "intended_channel": "Instagram Stories"
        }
      ]
    },
    "execution": {
      "recommended_channels": ["Instagram Feed", "Instagram Stories", "Instagram Reels"],
      "recommended_posting_window": "Suggested days/times for maximum impact",
      "campaign_duration": "Suggested campaign length"
    },
    "metadata": {
      "generated_at": "ISO timestamp",
      "context_used": ${JSON.stringify(contextUsed)},
      "performance_insights": [
        "Insight about why this campaign approach works",
        "Strategic or psychological insight",
        "Brand alignment or timing insight"
      ]
    }
  }
}`;

      const userPrompt = `Create a full Campaign Pack for:

PRIMARY OBJECTIVE: ${goal}
CAMPAIGN: ${planTitle}
${strategy.offer_terms ? `OFFER: ${strategy.offer_terms}` : ""}
${strategy.target_audience ? `TARGET AUDIENCE: ${strategy.target_audience}` : ""}
${strategy.campaign_angle ? `CAMPAIGN ANGLE: ${strategy.campaign_angle}` : ""}
${inputs?.key_message ? `KEY MESSAGE: ${inputs.key_message}` : ""}
${inputs?.call_to_action ? `CALL TO ACTION: ${inputs.call_to_action}` : ""}
${brainContext ? `\nVENUE CONTEXT:\n${brainContext}` : ""}

Generate a complete, professional, compliant campaign pack.`;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ error: "AI service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Generating campaign pack for venue ${venue_id}, goal: ${goal}`);

      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
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
        }
      );

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errorText = await aiResponse.text();
        console.error("AI gateway error:", status, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to generate campaign pack" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;
      if (!content) {
        return new Response(JSON.stringify({ error: "No content returned" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to parse campaign pack" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Normalize: accept both {campaign_pack: ...} and {kit: ...} shapes
      const pack = parsed.campaign_pack || parsed.kit || parsed;

      // Ensure metadata
      if (pack.metadata) {
        pack.metadata.context_used = contextUsed;
        pack.metadata.generated_at = new Date().toISOString();
      }

      // ── Atomic persistence using service-role client ──
      const planId = inputs?.plan_id;
      let persistenceOk = true;
      let outputCount = 0;
      let briefCount = 0;

      if (planId) {
        try {
          const copy = pack.copy || {};
          const outputRows = Object.entries(copy)
            .filter(([_, v]) => typeof v === "string" && (v as string).trim())
            .map(([key, val]) => ({
              plan_id: planId,
              output_type: key,
              title: key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              content: val as string,
              status: "draft",
              metadata: {},
            }));

          // Add visual_direction as an output too
          if (pack.production?.visual_direction) {
            outputRows.push({
              plan_id: planId,
              output_type: "visual_direction",
              title: "Visual Direction",
              content: pack.production.visual_direction,
              status: "draft",
              metadata: {},
            });
          }

          if (outputRows.length > 0) {
            // Clear previous outputs
            await supabaseAdmin.from("plan_outputs").delete().eq("plan_id", planId);
            const { error: outErr } = await supabaseAdmin.from("plan_outputs").insert(outputRows);
            if (outErr) {
              console.error("plan_outputs insert error:", outErr);
              persistenceOk = false;
            } else {
              outputCount = outputRows.length;
            }
          }

          // Persist asset briefs
          const briefs = pack.production?.asset_briefs;
          if (Array.isArray(briefs) && briefs.length > 0) {
            await supabaseAdmin.from("plan_asset_briefs").delete().eq("plan_id", planId);
            const briefRows = briefs.map((b: any) => ({
              plan_id: planId,
              asset_type: b.asset_type || "image",
              title: b.title || "Asset",
              brief: b.brief || "",
              intended_channel: b.intended_channel || null,
              status: "brief_ready",
              metadata: {},
            }));
            const { error: briefErr } = await supabaseAdmin.from("plan_asset_briefs").insert(briefRows);
            if (briefErr) {
              console.error("plan_asset_briefs insert error:", briefErr);
              persistenceOk = false;
            } else {
              briefCount = briefRows.length;
            }
          }

          // Update plan workspace snapshot
          await supabaseAdmin.from("plan_workspace_snapshots").upsert({
            plan_id: planId,
            venue_id: venue_id,
            snapshot: {
              has_campaign_pack: true,
              output_count: outputCount,
              brief_count: briefCount,
              last_generated: new Date().toISOString(),
              execution: pack.execution || null,
            },
            updated_at: new Date().toISOString(),
          }, { onConflict: "plan_id" });

          console.log(`Persisted ${outputCount} outputs and ${briefCount} briefs for plan ${planId}`);
        } catch (persistErr) {
          console.error("Persistence error:", persistErr);
          persistenceOk = false;
        }
      }

      if (!persistenceOk) {
        return new Response(
          JSON.stringify({ error: "Campaign pack generated but failed to save. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Campaign pack generated and persisted successfully");
      return new Response(
        JSON.stringify({
          campaign_pack: pack,
          persisted: { outputs: outputCount, briefs: briefCount },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════
    // LEGACY SINGLE-MODULE MODE
    // ═══════════════════════════════════════════════════
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
    if (!config) {
      return new Response(JSON.stringify({ error: "Unknown module" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const length = inputs.length || "medium";
    const systemPrompt = `You are a senior hospitality copywriter.\n\nBRAND CONTEXT:\n${brandContext.join("\n")}\n\n${complianceRules}\n\nGenerate exactly 3 variations. Format: ${config.format}\nTarget length: ${config.lengthGuide[length]}`;
    const userPrompt = `Create ${config.name} for:\nGOAL: ${goal}\nKEY MESSAGE: ${inputs.key_message}\nCTA: ${inputs.call_to_action}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
      }
    );

    if (!aiResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to generate copy" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "No content returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("generate-copy error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
