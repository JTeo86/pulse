import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHANNEL_SPECIFIC_SCHEMAS: Record<string, object> = {
  atmosphere: {
    ambience: "string",
    interior_materials: ["string"],
    crowd_energy: "string",
    time_of_day: "string",
  },
  plating: {
    plate_type: "string",
    garnish_density: "string",
    tableware: ["string"],
    food_focus: "string",
    plating_style: "string",
  },
  brand: {
    typography_present: false,
    logo_present: false,
    layout_style: "string",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { asset_id } = await req.json();
    if (!asset_id) throw new Error("Missing asset_id");

    // Load asset record
    const { data: asset, error: assetErr } = await supabase
      .from("style_reference_assets")
      .select("*")
      .eq("id", asset_id)
      .single();
    if (assetErr || !asset) throw new Error(`Asset not found: ${assetErr?.message}`);

    // Verify membership
    const { data: member } = await supabase
      .from("venue_members")
      .select("role")
      .eq("venue_id", asset.venue_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: venue } = await supabase.from("venues").select("owner_user_id").eq("id", asset.venue_id).single();
    const isOwner = venue?.owner_user_id === user.id;
    if (!isOwner && member?.role !== "manager") throw new Error("Insufficient permissions");

    // Mark as pending
    await supabase.from("style_reference_assets").update({ status: "pending_analysis" }).eq("id", asset_id);

    // Get signed URL for the image
    const bucketMap: Record<string, string> = {
      brand: "brand_inspiration",
      atmosphere: "venue_atmosphere",
      plating: "plating_style",
    };
    const bucket = bucketMap[asset.channel];
    const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(asset.storage_path, 300);
    if (!signedData?.signedUrl) throw new Error("Could not get signed URL");

    // Fetch image as base64
    const imgResp = await fetch(signedData.signedUrl);
    const imgBuffer = await imgResp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";

    const channelSpecificSchema = CHANNEL_SPECIFIC_SCHEMAS[asset.channel] || {};
    const systemPrompt = `You are a professional visual analyst specializing in hospitality brand photography. 
Analyze the provided image and return ONLY valid JSON matching this exact schema. No markdown, no explanation, just JSON.

{
  "palette": {
    "dominant_colors": ["hex or color name"],
    "temperature": "warm|cool|neutral",
    "saturation": "muted|medium|vibrant",
    "contrast": "low|medium|high"
  },
  "lighting": {
    "type": "natural|artificial|mixed",
    "direction": "front|side|back|overhead|ambient",
    "softness": "soft|medium|hard",
    "intensity": "low|medium|high"
  },
  "composition": {
    "angle": "eye-level|overhead|low-angle|diagonal",
    "framing": "tight|medium|wide",
    "negative_space": "minimal|moderate|generous",
    "depth_of_field": "shallow|medium|deep"
  },
  "mood_tags": ["tag1", "tag2"],
  "editing_style": {
    "grain": "none|subtle|heavy",
    "sharpness": "soft|medium|sharp",
    "vignette": "none|subtle|strong",
    "color_grading": "natural|filmic|moody|bright|desaturated"
  },
  "scene_context": "brief scene description",
  "channel_specific": ${JSON.stringify(channelSpecificSchema)},
  "confidence_score": 0.85
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: "text",
                text: `Analyze this ${asset.channel} reference image for a hospitality venue. Return only JSON.`,
              },
            ],
          },
        ],
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini error: ${response.status} ${errText}`);
    }

    const geminiResult = await response.json();
    const rawContent = geminiResult.choices?.[0]?.message?.content || "{}";

    // Parse JSON - strip markdown code fences if present
    const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let analysisJson: Record<string, unknown>;
    try {
      analysisJson = JSON.parse(jsonStr);
    } catch {
      throw new Error(`Failed to parse Gemini response as JSON: ${jsonStr.slice(0, 200)}`);
    }

    const confidenceScore = typeof analysisJson.confidence_score === "number"
      ? Math.max(0, Math.min(1, analysisJson.confidence_score as number))
      : 0.7;

    // Generate summary text
    const palette = analysisJson.palette as Record<string, unknown>;
    const lighting = analysisJson.lighting as Record<string, unknown>;
    const moodTags = (analysisJson.mood_tags as string[] || []).slice(0, 4).join(", ");
    const composition = analysisJson.composition as Record<string, unknown>;
    const channelSpecific = analysisJson.channel_specific as Record<string, unknown>;

    const summaryText = `${palette?.temperature || ""} toned image with ${lighting?.type || ""} ${lighting?.softness || ""} lighting. ` +
      `Mood: ${moodTags}. ${composition?.angle || ""} angle with ${palette?.saturation || ""} saturation. ` +
      (channelSpecific?.ambience ? `Ambience: ${channelSpecific.ambience}. ` : "") +
      (channelSpecific?.plating_style ? `Plating: ${channelSpecific.plating_style}. ` : "") +
      (channelSpecific?.layout_style ? `Layout: ${channelSpecific.layout_style}. ` : "") +
      `${analysisJson.scene_context || ""}`;

    // Generate embedding of summary text
    const embedResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "user",
            content: `Extract 20 key style keywords as a JSON array from this text. Return only a JSON array of strings: "${summaryText}"`,
          },
        ],
        max_tokens: 300,
      }),
    });

    let embedding: string[] = [];
    if (embedResponse.ok) {
      const embedResult = await embedResponse.json();
      const embedContent = embedResult.choices?.[0]?.message?.content || "[]";
      try {
        const cleanEmbed = embedContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        embedding = JSON.parse(cleanEmbed);
      } catch {
        embedding = moodTags.split(", ").filter(Boolean);
      }
    }

    // Store analysis record
    const { data: analysisRecord, error: insertErr } = await supabase
      .from("style_analysis")
      .upsert({
        venue_id: asset.venue_id,
        asset_id: asset_id,
        channel: asset.channel,
        analysis_json: analysisJson,
        summary_text: summaryText.trim(),
        embedding: embedding,
        confidence_score: confidenceScore,
      }, { onConflict: "asset_id" })
      .select()
      .single();

    if (insertErr) throw new Error(`Failed to store analysis: ${insertErr.message}`);

    // Update asset status
    await supabase.from("style_reference_assets")
      .update({ status: "analyzed" })
      .eq("id", asset_id);

    // Trigger profile rebuild (fire-and-forget)
    supabase.rpc("rebuild_venue_style_profile", { p_venue_id: asset.venue_id }).then(() => {}).catch(() => {});

    return new Response(JSON.stringify({ success: true, analysis_id: analysisRecord?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-style-asset error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
