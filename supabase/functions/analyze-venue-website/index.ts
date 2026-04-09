import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, resolveModelForTask, chatCompletionsUrl } from "../_shared/ai-key-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AnalyzeRequest = {
  website_url?: string;
  venue_id?: string;
};

type ExtractedSignals = {
  title: string;
  metaDescription: string;
  headings: string[];
  bodySnippet: string;
};

const emptySuggestions = {
  venueName: "",
  cuisineType: "",
  location: "",
  tone: "",
  audience: "",
  positioning: "",
  voiceStyle: "",
  visualStyle: "",
  contentGoals: "",
};

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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { website_url, venue_id } = await req.json() as AnalyzeRequest;
    if (!website_url?.trim()) {
      return new Response(JSON.stringify({ error: "website_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (venue_id) {
      const { data: isMember } = await supabaseAdmin.rpc("is_venue_member", {
        check_venue_id: venue_id,
        check_user_id: user.id,
      });
      if (!isMember) {
        return new Response(JSON.stringify({ error: "Not a member of this venue" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const normalizedUrl = normalizeUrl(website_url);
    const warnings: string[] = [];

    let html = "";
    try {
      const response = await fetch(normalizedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "PulseVenueAnalyzer/1.0 (+https://trypulse.ai)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        warnings.push(`Could not fetch website (HTTP ${response.status}).`);
      } else {
        html = await response.text();
      }
    } catch (error) {
      console.error("Website fetch failed", error);
      warnings.push("Could not fetch website content. Suggestions are based on limited input.");
    }

    const extracted = extractSignals(html);
    if (!extracted.title && !extracted.metaDescription && extracted.headings.length === 0 && !extracted.bodySnippet) {
      warnings.push("Website content appears limited; suggestions may be partial.");
    }

    const aiConfig = await resolveAiConfig();
    const aiResponse = await fetch(chatCompletionsUrl(aiConfig), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveModelForTask("copy_generate", aiConfig),
        messages: [
          {
            role: "system",
            content: `You analyze restaurant/venue websites and infer onboarding profile drafts.
Return strictly JSON in this format:
{
  "venueName": "",
  "cuisineType": "",
  "location": "",
  "tone": "",
  "audience": "",
  "positioning": "",
  "voiceStyle": "",
  "visualStyle": "",
  "contentGoals": "",
  "confidence": "high|medium|low"
}
Rules:
- Be concise and practical for marketing onboarding.
- If unknown, keep values short and tentative instead of inventing specifics.
- Use website evidence first.`,
          },
          {
            role: "user",
            content: `Website URL: ${normalizedUrl}
Page title: ${extracted.title || ""}
Meta description: ${extracted.metaDescription || ""}
Headings: ${extracted.headings.join(" | ")}
Body snippet: ${extracted.bodySnippet || ""}

Generate onboarding draft values.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    let suggestions = emptySuggestions;
    let confidence = "low";

    if (!aiResponse.ok) {
      warnings.push("AI analysis is currently limited; returning fallback suggestions.");
      suggestions = fallbackSuggestionsFromUrl(normalizedUrl);
    } else {
      const aiData = await aiResponse.json();
      const content = aiData?.choices?.[0]?.message?.content;
      try {
        const parsed = JSON.parse(content || "{}");
        suggestions = {
          venueName: clean(parsed.venueName),
          cuisineType: clean(parsed.cuisineType),
          location: clean(parsed.location),
          tone: clean(parsed.tone),
          audience: clean(parsed.audience),
          positioning: clean(parsed.positioning),
          voiceStyle: clean(parsed.voiceStyle),
          visualStyle: clean(parsed.visualStyle),
          contentGoals: clean(parsed.contentGoals),
        };
        confidence = ["high", "medium", "low"].includes(parsed.confidence)
          ? parsed.confidence
          : "low";
      } catch (error) {
        console.error("AI parse error", error);
        warnings.push("Could not parse AI output completely; returning partial suggestions.");
        suggestions = fallbackSuggestionsFromUrl(normalizedUrl);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      website_url: normalizedUrl,
      extracted,
      suggestions,
      confidence,
      warnings,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-venue-website error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function extractSignals(html: string): ExtractedSignals {
  const title = decode(stripTags(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)));
  const metaDescription = decode(stripTags(
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)
      || firstMatch(html, /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i),
  ));

  const headingMatches = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => decode(stripTags(m[1])))
    .filter(Boolean)
    .slice(0, 12);

  const withoutScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const bodyMatch = firstMatch(withoutScript, /<body[^>]*>([\s\S]*?)<\/body>/i) || withoutScript;
  const bodySnippet = decode(stripTags(bodyMatch))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);

  return {
    title: title.slice(0, 220),
    metaDescription: metaDescription.slice(0, 400),
    headings: headingMatches,
    bodySnippet,
  };
}

function firstMatch(input: string, regex: RegExp): string {
  const match = input.match(regex);
  return match?.[1]?.trim() || "";
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decode(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackSuggestionsFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const brandGuess = host.split(".")[0]
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return {
      ...emptySuggestions,
      venueName: brandGuess,
      positioning: "Neighborhood hospitality venue focused on memorable guest experiences.",
      contentGoals: "Highlight signature offerings, ambience, social proof, and repeat-visit reasons.",
    };
  } catch {
    return emptySuggestions;
  }
}
