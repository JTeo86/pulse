import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { submissionId } = await req.json();
    if (!submissionId) throw new Error("submissionId required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch the submission
    const { data: sub, error: subErr } = await sb
      .from("guest_submissions")
      .select("*, venues:venue_id(name, city)")
      .eq("id", submissionId)
      .single();

    if (subErr || !sub) throw new Error("Submission not found");

    const venueName = (sub as any).venues?.name || "the venue";
    const city = (sub as any).venues?.city || "";

    // Use Lovable AI to generate caption, hashtags, and posting time
    const prompt = `You are a social media manager for ${venueName}${city ? ` in ${city}` : ""}. A guest submitted a photo of their meal/experience. Generate:
1. A short, engaging Instagram caption (2-3 sentences max, include a call to action)
2. 5-8 relevant hashtags
3. Best posting time suggestion (e.g. "Tuesday 18:30" or "Weekend afternoon")

Guest name: ${sub.guest_name || "Anonymous guest"}

Respond in JSON format:
{"caption": "...", "hashtags": ["#tag1", "#tag2"], "suggested_post_time": "..."}`;

    let caption = `Thank you for dining with us! 📸 Photo shared by ${sub.guest_name || "a wonderful guest"}.`;
    let hashtags = ["#foodie", "#restaurant", "#delicious", "#instafood", "#foodphotography"];
    let suggestedPostTime = "Weekday evening 18:00-19:00";

    if (lovableKey) {
      try {
        const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            caption = parsed.caption || caption;
            hashtags = parsed.hashtags || hashtags;
            suggestedPostTime = parsed.suggested_post_time || suggestedPostTime;
          }
        }
      } catch (aiErr) {
        console.error("AI generation failed, using defaults:", aiErr);
      }
    }

    // Update the submission with generated content
    const { error: updateErr } = await sb
      .from("guest_submissions")
      .update({
        generated_caption: caption,
        suggested_hashtags: hashtags,
        suggested_post_time: suggestedPostTime,
      })
      .eq("id", submissionId);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ caption, hashtags, suggestedPostTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
