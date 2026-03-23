import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function sniffImage(buf: ArrayBuffer | Uint8Array): { ext: string; contentType: string } {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

async function uploadResultBuffer(
  supabase: any,
  venueId: string,
  buffer: Uint8Array,
  suffix: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const { ext, contentType } = sniffImage(buffer);
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('venue-assets').upload(path, buffer, { contentType });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
  // venue-assets is a private bucket — create a long-lived signed URL
  const { data: signedData, error: signError } = await supabase.storage
    .from('venue-assets')
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signError?.message || 'no URL returned'}`);
  }
  return { publicUrl: signedData.signedUrl, storagePath: path };
}

async function resolveSourceImage(
  supabase: any,
  venueId: string,
  inputImageUrl?: string,
  sourceFileBase64?: string,
  sourceFileName?: string,
): Promise<{ base64: string; mime: string; publicUrl: string }> {
  if (sourceFileBase64) {
    const ext = (sourceFileName || 'image.jpg').split('.').pop() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const bin = atob(sourceFileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `venues/${venueId}/uploads/${crypto.randomUUID()}.${ext}`;
    await supabase.storage.from('venue-assets').upload(path, bytes, { contentType: mime });
    const { data: signedData } = await supabase.storage.from('venue-assets').createSignedUrl(path, 86400);
    const signedUrl = signedData?.signedUrl || '';
    return { base64: sourceFileBase64, mime, publicUrl: signedUrl };
  }
  if (inputImageUrl) {
    const resp = await fetch(inputImageUrl);
    if (!resp.ok) throw new Error('Failed to fetch source image');
    const arrBuf = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrBuf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const mime = resp.headers.get('content-type') || 'image/jpeg';
    return { base64, mime, publicUrl: inputImageUrl };
  }
  throw new Error('input_image_url or sourceFileBase64 required');
}

// ── Venue Style Context Builder ──────────────────────────────────────

interface VenueStyleContext {
  brandSummary: string;
  styleSummary: string;
  lightingMood: string;
  luxuryLevel: string;
  cuisineType: string;
  venueTone: string;
  negativeRules: string[];
  dishLockRules: string[];
  referenceImages: { url: string; channel: string; assetId: string }[];
  styleSourcesUsed: string[];
  venueName: string;
  venueCity: string;
  // Aggregated negative feedback counts for mode tuning
  feedbackSignals: Record<string, number>;
}

async function buildVenueStyleContext(
  supabase: any,
  venueId: string,
): Promise<VenueStyleContext> {
  const styleSourcesUsed: string[] = [];

  const [venueResult, brandKitResult, styleProfileResult, refAssetsResult, legacyRefResult, feedbackResult] = await Promise.all([
    supabase.from('venues').select('name, city').eq('id', venueId).single(),
    supabase.from('brand_kits').select('preset, rules_text').eq('venue_id', venueId).single(),
    supabase.from('venue_style_profiles').select('*').eq('venue_id', venueId).maybeSingle(),
    supabase.from('venue_style_reference_assets')
      .select('id, storage_path, public_url, channel, pinned, source_type')
      .eq('venue_id', venueId).eq('approved', true).eq('status', 'active')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(6),
    supabase.from('style_reference_assets')
      .select('id, storage_path, channel, pinned')
      .eq('venue_id', venueId).eq('status', 'analyzed')
      .in('channel', ['atmosphere', 'brand', 'plating'])
      .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(6),
    supabase.from('venue_style_feedback')
      .select('feedback_type')
      .eq('venue_id', venueId)
      .not('feedback_type', 'in', '("approved","great_match")')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const venueName = venueResult.data?.name || 'restaurant';
  const venueCity = venueResult.data?.city || '';
  const brandPreset = brandKitResult.data?.preset || 'casual';
  const brandRules = brandKitResult.data?.rules_text || '';
  const sp = styleProfileResult.data;

  let brandSummary = '';
  let styleSummary = '';
  let lightingMood = '';
  let luxuryLevel = '';
  let cuisineType = '';
  let negativeRules: string[] = [];
  let dishLockRules: string[] = [];

  if (sp) {
    styleSourcesUsed.push('venue_style_profiles');
    brandSummary = sp.brand_summary || '';
    styleSummary = sp.style_summary || '';
    lightingMood = sp.lighting_mood || '';
    luxuryLevel = sp.luxury_level || '';
    cuisineType = sp.cuisine_type || '';
    negativeRules = Array.isArray(sp.negative_prompt_rules) ? sp.negative_prompt_rules : [];
    dishLockRules = Array.isArray(sp.dish_lock_rules) ? sp.dish_lock_rules : [];
  }

  // Aggregate feedback signals
  const feedbackSignals: Record<string, number> = {};
  const negativeFeedback = feedbackResult.data || [];
  if (negativeFeedback.length > 0) {
    styleSourcesUsed.push('negative_feedback');
    for (const fb of negativeFeedback) {
      feedbackSignals[fb.feedback_type] = (feedbackSignals[fb.feedback_type] || 0) + 1;
    }
    const feedbackRuleMap: Record<string, string> = {
      too_dark: 'Avoid overly dark or underexposed images — user has flagged this multiple times',
      too_bright: 'Avoid overexposed or washed-out lighting — user prefers controlled exposure',
      too_generic: 'Avoid generic stock-photo-like compositions — create unique, venue-specific scenes. Do NOT invent props or use generic luxury surfaces.',
      not_our_style: 'Pay extra attention to venue style references — previous outputs did not match the brand identity. Prioritize real venue environment over generic styling.',
      dish_changed: 'Strictly preserve the original dish appearance — do not alter, rearrange, or reimagine the food presentation',
    };
    for (const [type, count] of Object.entries(feedbackSignals)) {
      if (count >= 2 && feedbackRuleMap[type]) {
        negativeRules.push(feedbackRuleMap[type]);
      }
    }
  }

  if (brandKitResult.data) {
    styleSourcesUsed.push('brand_kit');
    if (!brandSummary) brandSummary = brandRules;
  }

  const referenceImages: { url: string; channel: string; assetId: string }[] = [];

  const newAssets = refAssetsResult.data || [];
  if (newAssets.length > 0) {
    styleSourcesUsed.push('venue_style_reference_assets');
    for (const asset of newAssets.slice(0, 3)) {
      if (asset.public_url) {
        try {
          const head = await fetch(asset.public_url, { method: 'HEAD' });
          if (head.ok) {
            referenceImages.push({ url: asset.public_url, channel: asset.channel, assetId: asset.id });
            continue;
          }
        } catch { /* fall through */ }
      }
      const { data: signedRef } = await supabase.storage.from('venue-assets').createSignedUrl(asset.storage_path, 300);
      if (signedRef?.signedUrl) {
        referenceImages.push({ url: signedRef.signedUrl, channel: asset.channel, assetId: asset.id });
      }
    }
  }

  if (referenceImages.length === 0) {
    const legacyAssets = legacyRefResult.data || [];
    if (legacyAssets.length > 0) {
      styleSourcesUsed.push('style_reference_assets');
      const bucketMap: Record<string, string> = { atmosphere: 'venue_atmosphere', brand: 'brand_inspiration', plating: 'plating_style' };
      for (const asset of legacyAssets.slice(0, 3)) {
        const bucket = bucketMap[asset.channel] || 'venue_atmosphere';
        const isPublic = bucket === 'venue_atmosphere';
        try {
          let imageUrl: string;
          if (isPublic) {
            imageUrl = supabase.storage.from(bucket).getPublicUrl(asset.storage_path).data.publicUrl;
          } else {
            const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(asset.storage_path, 300);
            if (!signedData?.signedUrl) continue;
            imageUrl = signedData.signedUrl;
          }
          const headResp = await fetch(imageUrl, { method: 'HEAD' });
          if (!headResp.ok) continue;
          referenceImages.push({ url: imageUrl, channel: asset.channel, assetId: asset.id });
        } catch { /* skip */ }
      }
    }
  }

  if (referenceImages.length > 0) styleSourcesUsed.push('reference_images');

  return {
    brandSummary, styleSummary, lightingMood, luxuryLevel, cuisineType,
    venueTone: brandPreset, negativeRules, dishLockRules, referenceImages,
    styleSourcesUsed, venueName, venueCity, feedbackSignals,
  };
}

// ── Background Adherence + Composition Fidelity ──────────────────────

type BackgroundAdherence = 'exact' | 'close' | 'inspired' | 'creative';
type CompositionFidelity = 'locked' | 'mostly_preserved' | 'flexible' | 'creative';
type GenerationMode = 'authentic_social' | 'enhanced' | 'campaign' | 'reference_match';

// ── Structured Generation Plan ───────────────────────────────────────

interface GenerationPlan {
  mode: GenerationMode;
  background_adherence: BackgroundAdherence;
  composition_fidelity: CompositionFidelity;
  preservation_level: number;
  composition_flexibility: number;
  background_flexibility: number;
  plating_refinement: number;
  lighting_drama: number;
  styling_intensity: number;
  prop_invention: boolean;
  realism_guardrails: string;
}

function buildGenerationPlan(
  mode: string,
  backgroundAdherence?: string,
  compositionFidelity?: string,
  feedbackSignals?: Record<string, number>,
): GenerationPlan {
  // Apply feedback-driven bias: if venue repeatedly rejects as too_generic/not_our_style,
  // tighten background adherence and reduce styling for non-campaign modes
  const genericRejects = (feedbackSignals?.too_generic || 0) + (feedbackSignals?.not_our_style || 0);
  const hasAuthenticityBias = genericRejects >= 4;

  switch (mode) {
    case 'authentic_social':
      return {
        mode: 'authentic_social',
        background_adherence: (backgroundAdherence as BackgroundAdherence) || 'exact',
        composition_fidelity: (compositionFidelity as CompositionFidelity) || 'mostly_preserved',
        preservation_level: 0.92,
        composition_flexibility: 0.08,
        background_flexibility: 0.1,
        plating_refinement: 0.03,
        lighting_drama: 0.12,
        styling_intensity: 0.05,
        prop_invention: false,
        realism_guardrails: 'strict',
      };
    case 'enhanced':
      return {
        mode: 'enhanced',
        background_adherence: (backgroundAdherence as BackgroundAdherence) || (hasAuthenticityBias ? 'close' : 'close'),
        composition_fidelity: (compositionFidelity as CompositionFidelity) || 'mostly_preserved',
        preservation_level: 0.75,
        composition_flexibility: 0.25,
        background_flexibility: hasAuthenticityBias ? 0.3 : 0.4,
        plating_refinement: 0.2,
        lighting_drama: 0.35,
        styling_intensity: hasAuthenticityBias ? 0.25 : 0.4,
        prop_invention: false,
        realism_guardrails: 'moderate',
      };
    case 'campaign':
      return {
        mode: 'campaign',
        background_adherence: (backgroundAdherence as BackgroundAdherence) || 'inspired',
        composition_fidelity: (compositionFidelity as CompositionFidelity) || 'flexible',
        preservation_level: 0.5,
        composition_flexibility: 0.6,
        background_flexibility: 0.75,
        plating_refinement: 0.4,
        lighting_drama: 0.75,
        styling_intensity: 0.7,
        prop_invention: true,
        realism_guardrails: 'relaxed',
      };
    case 'reference_match':
      return {
        mode: 'reference_match',
        background_adherence: (backgroundAdherence as BackgroundAdherence) || 'exact',
        composition_fidelity: (compositionFidelity as CompositionFidelity) || 'locked',
        preservation_level: 0.95,
        composition_flexibility: 0.05,
        background_flexibility: 0.05,
        plating_refinement: 0.02,
        lighting_drama: 0.1,
        styling_intensity: 0.05,
        prop_invention: false,
        realism_guardrails: 'strict',
      };
    default:
      return buildGenerationPlan('authentic_social', backgroundAdherence, compositionFidelity, feedbackSignals);
  }
}

// ── Prompt Construction ──────────────────────────────────────────────

function buildPrompt(ctx: VenueStyleContext, plan: GenerationPlan): string {
  const toneMap: Record<string, string> = {
    casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
    premium: 'upscale dining restaurant with dark wood, candlelight, and quality tableware',
    luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
    nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
    family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
  };
  const venueTone = toneMap[ctx.venueTone] || toneMap.casual;
  const hasRefs = ctx.referenceImages.length > 0;

  // ── DISH LOCK — always strict ──
  const dishLockExtra = ctx.dishLockRules.length > 0
    ? '\n' + ctx.dishLockRules.map(r => `- ${r}`).join('\n')
    : '';

  const negativeSection = ctx.negativeRules.length > 0
    ? `\n\nNEGATIVE RULES (DO NOT):\n${ctx.negativeRules.map(r => `- ${r}`).join('\n')}`
    : '';

  let styleSection = '';
  if (ctx.styleSummary || ctx.lightingMood || ctx.cuisineType || ctx.luxuryLevel) {
    const parts: string[] = [];
    if (ctx.cuisineType) parts.push(`Cuisine: ${ctx.cuisineType}`);
    if (ctx.luxuryLevel) parts.push(`Level: ${ctx.luxuryLevel}`);
    if (ctx.lightingMood) parts.push(`Lighting mood: ${ctx.lightingMood}`);
    if (ctx.styleSummary) parts.push(`Style: ${ctx.styleSummary}`);
    styleSection = `\n\nVENUE IDENTITY:\n${parts.join('\n')}`;
  }

  // ── BACKGROUND ADHERENCE DIRECTIVES ──
  let backgroundDirective: string;
  switch (plan.background_adherence) {
    case 'exact':
      backgroundDirective = `BACKGROUND — EXACT VENUE SETTING:
- Keep the original background and table surface as-is.
- Only remove obvious distractions (trash, fingers, phone edges, stray crumbs).
- Do NOT replace the table, tablecloth, countertop, or any surface.
- Do NOT add any new surfaces, textures, or materials not already visible.
- The setting must look like the same real location where the photo was taken.
- Preserve all existing tableware, glasses, napkins — they are part of the authentic scene.
- Do NOT invent or add props, decorations, flowers, candles, or styling elements.`;
      break;
    case 'close':
      backgroundDirective = `BACKGROUND — CLOSE VENUE SETTING:
- Keep the general character of the original background — same type of surface, similar color family.
- You may clean up and subtly refine the table/surface, but it must remain recognizably similar.
- Do NOT switch to a completely different surface type (e.g., don't replace wood with marble).
- Minor cleanup of distracting background elements is acceptable.
- Add gentle depth-of-field blur to the background to make the dish the clear focal point.
- Preserve the authentic restaurant/bar/café feel — this should look like the real venue.
- Do NOT add elaborate props or staging that was not present.`;
      break;
    case 'inspired':
      backgroundDirective = `BACKGROUND — VENUE-INSPIRED SETTING:
- Use the venue's brand identity and style references to create an elevated version of their environment.
- You may upgrade the table surface and surroundings, but stay within the venue's aesthetic family.
- The background should feel like the venue on its best day — not a different venue.
- You may add simple, tasteful props (a napkin, utensil, glass) that match the venue's style level.
- Avoid generic luxury surfaces (marble, linen) unless the venue references explicitly show them.
- Add professional depth-of-field and atmospheric blur.`;
      break;
    case 'creative':
      backgroundDirective = `BACKGROUND — PREMIUM EDITORIAL ENVIRONMENT:
- Create a rich, luxurious restaurant environment with depth and atmosphere.
- Use moody, textured backgrounds — surfaces and lighting that tell a story.
- Add environmental storytelling: candlelight reflections, bokeh, ambient elements.
- The setting should feel aspirational and campaign-worthy.
- You may add premium styling elements that enhance the visual narrative.`;
      break;
  }

  // ── COMPOSITION FIDELITY DIRECTIVES ──
  let compositionDirective: string;
  switch (plan.composition_fidelity) {
    case 'locked':
      compositionDirective = `COMPOSITION — LOCKED:
- Keep the EXACT same camera angle, framing, crop, and perspective as the original.
- The dish must remain in the same position within the frame.
- Do NOT rotate, tilt, zoom, reframe, or adjust the aspect ratio.
- Do NOT add or remove negative space.
- The viewer comparing original and output should see the same composition.`;
      break;
    case 'mostly_preserved':
      compositionDirective = `COMPOSITION — MOSTLY PRESERVED:
- Keep the same general camera angle and perspective as the original.
- You may make very minor framing adjustments to improve balance (slight center correction).
- Do NOT change the viewing angle dramatically (e.g., overhead to eye-level).
- The composition should feel like the same shot, just slightly better framed.
- Do NOT dramatically crop, zoom, or recompose.`;
      break;
    case 'flexible':
      compositionDirective = `COMPOSITION — FLEXIBLE:
- You may adjust framing to improve composition — rule-of-thirds, better centering.
- Minor angle adjustments are acceptable.
- You may add intentional negative space for better visual breathing room.
- Keep the dish as the clear hero and subject.`;
      break;
    case 'creative':
      compositionDirective = `COMPOSITION — CREATIVE FREEDOM:
- Recompose for maximum visual impact. Use dramatic framing.
- Apply rule of thirds, golden ratio, or asymmetric balance.
- You may use a more dramatic angle — lower perspective, close-up detail, or elegant overhead.
- Use negative space deliberately for a magazine-layout feel.`;
      break;
  }

  // ── MODE-SPECIFIC LIGHTING + POLISH + ENVIRONMENT ──
  let lightingDirective: string;
  let polishDirective: string;
  let environmentDirective: string;
  let modeGoal: string;

  if (plan.mode === 'authentic_social') {
    lightingDirective = `LIGHTING — GENTLE, AUTHENTIC CORRECTION:
- Correct white balance if the image has a noticeable color cast.
- Fix minor underexposure or overexposure gently.
- Do NOT add dramatic directional lighting, rim lighting, backlighting, or spotlight effects.
- Preserve the original natural shadow directions and ambient light character.
- The lighting should feel natural and real — like a phone photo in good conditions.
- Subtle warmth is acceptable. Avoid cool/clinical tones.`;

    polishDirective = `POLISH — SUBTLE, INVISIBLE CLEANUP:
- Slightly sharpen for clarity. Minor noise reduction if needed.
- Subtle contrast adjustment — do not over-punch colors.
- The output should look like the same photo taken with slightly better conditions.
- No visible editing or retouching. No HDR effect. No over-saturation.
- Colors must remain natural and believable.
- This should look like a real photo, NOT like it was professionally retouched.`;

    environmentDirective = `ENVIRONMENT — DO NOT CHANGE:
- Keep existing tableware, napkins, cutlery, glasses exactly as they are.
- Do NOT add new props, accessories, garnishes, or decorative elements.
- Do NOT upgrade or change crockery, glassware, or table items.
- Do NOT remove minor real-world imperfections (slightly wrinkled napkin, water spot on glass).
- Preserve the authentic, lived-in restaurant environment.
- The scene should feel honest and real.`;

    modeGoal = `GOAL: The output must look like the same photograph, gently improved — as if the person had slightly better phone camera skills and the lighting was a bit better that day. A real person scrolling Instagram should NOT be able to tell this was AI-enhanced. It should feel completely authentic, believable, and suitable for posting as genuine venue content. This is NOT a studio shot — it's an improved version of a real moment.`;

  } else if (plan.mode === 'enhanced') {
    lightingDirective = `LIGHTING — PROFESSIONAL BUT NATURAL:
- Apply soft, natural-looking directional lighting improvement.
- Gentle fill to reduce harsh shadows under the dish.
- Create natural-looking highlights on food surfaces where appropriate.
- Use warm color temperature for an inviting feel.
- Add moderate depth-of-field — gently blur background while keeping the full dish sharp.
- The lighting should feel professional but NOT theatrical or cinematic.`;

    polishDirective = `POLISH — SOCIAL-MEDIA READY:
- Increase micro-contrast on the food for texture pop.
- Boost color saturation moderately — vibrant but still natural.
- Professional sharpening on the dish area.
- The image should feel "Instagram-worthy" — clearly better than a casual phone photo.
- Still believable and authentic — NOT stock-photo-like.
- Avoid over-processing that makes the image look fake or artificial.`;

    environmentDirective = `ENVIRONMENT — TASTEFUL, MINIMAL UPGRADE:
- You may add ONE simple, elegant prop if it improves the scene: a clean napkin or a fork.
- Props must be minimal and must not compete with the dish.
- Do NOT create an elaborate styled scene.
- Ensure any added elements match the venue's actual style level.
- The table setting should suggest a real restaurant, not a photo studio.`;

    modeGoal = `GOAL: The output should look noticeably better than the original — like a professional food photographer captured it with proper lighting in a real restaurant. It should feel elevated but still authentic and believable. Someone viewing this should think "wow, their food photography has gotten really good" — not "that looks AI-generated."`;

  } else if (plan.mode === 'campaign') {
    lightingDirective = `LIGHTING — CINEMATIC & DRAMATIC:
- Use dramatic directional lighting — strong key light creating pronounced shadows.
- Add rim lighting or edge light to separate the dish from the background.
- Create deep, rich shadows alongside bright highlights for contrast.
- Use warm golden tones mixed with cool shadow areas for cinematic color contrast.
- Apply strong shallow depth-of-field with creamy bokeh.
- Add specular highlights on sauces, oils, and glossy surfaces.
- The lighting should feel intentional, editorial, and magazine-quality.`;

    polishDirective = `POLISH — HIGH-END CAMPAIGN FINISH:
- Maximum professional retouching — every detail should be perfected.
- Rich, deep colors with controlled saturation for a premium feel.
- Pronounced micro-contrast for dramatic texture detail on the food.
- Cinematic color grading — this is a campaign image, not a casual photo.
- The overall tone should feel luxurious, warm, and aspirational.`;

    environmentDirective = `ENVIRONMENT — PREMIUM STYLING:
- Add premium styling elements: elegant cutlery, linen, crystal, or wine glass.
- Use a sophisticated color palette in props and surfaces.
- Every element should reinforce a premium dining narrative.
- The scene should look professionally styled for a marketing campaign.
- Include subtle premium details: fabric texture, reflective surfaces, fine tableware.`;

    modeGoal = `GOAL: The output should look dramatically elevated — like a premium ad campaign or magazine editorial. Think high-end food magazine cover or luxury hotel marketing. The dish is the hero in a cinematic, aspirational scene. This mode is explicitly for campaign/hero content, not everyday social posting.`;

  } else {
    // reference_match
    lightingDirective = `LIGHTING — MATCH REFERENCES EXACTLY:
- Match the lighting conditions shown in the provided reference images as closely as possible.
- Reproduce the same light direction, warmth, and shadow character visible in references.
- If no references are provided, use gentle natural lighting similar to the original photo.
- Do NOT add lighting effects that contradict the reference images.`;

    polishDirective = `POLISH — MINIMAL, REFERENCE-MATCHED:
- Apply only the level of polish visible in the reference images.
- If references show casual real-world scenes, keep the output similarly casual.
- If references show polished imagery, match that level.
- Do NOT exceed the polish level shown in references.`;

    environmentDirective = `ENVIRONMENT — STRICT REFERENCE MATCHING:
- Reproduce the table surface, tableware style, and environmental details from reference images.
- Match the color palette, material textures, and ambient feel of the references.
- If references show wood tables, use wood. If they show marble, use marble.
- The output environment should be recognizably the same as the reference images.
- Do NOT add elements not visible in any reference image.`;

    modeGoal = `GOAL: The output should look like it was taken in the same exact environment shown in the reference images, with the uploaded dish placed naturally into that setting. The reference images define the target environment — match them as faithfully as possible. If no references are provided, preserve the original photo's environment with only minimal cleanup.`;
  }

  // ── ANTI-GENERIC RULES (always applied) ──
  const antiGenericRules = `
AUTHENTICITY RULES (ALWAYS APPLY):
- Do NOT make the image look like a stock photo or generic food advertisement.
- Do NOT default to marble surfaces, white linen, or luxury glass unless the venue references specifically show these materials.
- Do NOT invent elaborate table styling that does not match the venue's actual environment.
- Real-world imperfections (slightly uneven napkin, natural table grain, small water drops) add authenticity — preserve them in Authentic Social and Reference Match modes.
- The output should feel like it belongs on a REAL restaurant's social media, not a stock photo website.
- Avoid the "perfect AI look" — slight natural variation makes images more believable.${!plan.prop_invention ? '\n- Do NOT add props, decorations, flowers, candles, or garnishes not present in the original photo.' : ''}`;

  const refInstruction = hasRefs
    ? `Match the specific table surfaces, interior atmosphere, lighting mood, and color palette of the provided reference images. The references show the REAL venue environment — reproduce it faithfully.`
    : `Generate a restaurant environment matching this style: ${venueTone}.${ctx.venueCity ? ` Located in ${ctx.venueCity}.` : ''} Keep it authentic and believable.`;

  return `You are editing a food photograph for restaurant marketing. Mode: ${plan.mode.toUpperCase()}.

STRICT DISH LOCK RULES — THESE OVERRIDE EVERYTHING:
- The food in the uploaded image must remain visually identical.
- Preserve the exact dish, ingredients, plating and portion size.
- Do NOT add garnish that was not present.
- Do NOT remove ingredients.
- Do NOT alter the crockery or plate.
- Do NOT change the shape or arrangement of the dish.
- Treat the food area as locked pixels. Only the surrounding environment may be modified.
- Do NOT add text, watermarks, logos, or any overlays.
- Do NOT make the image look artificial, illustrated, or AI-generated.${dishLockExtra}
${styleSection}${negativeSection}

${compositionDirective}

${backgroundDirective}

${lightingDirective}

${polishDirective}

${environmentDirective}
${antiGenericRules}

VENUE REFERENCE:
${refInstruction}
${ctx.venueName ? `Venue: "${ctx.venueName}"` : ''}
${ctx.brandSummary ? `Brand notes: ${ctx.brandSummary.substring(0, 400)}` : ''}

${modeGoal}

Output as JPEG. Do NOT output PNG with transparency.`.trim();
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const {
      venue_id, input_image_url, sourceFileBase64, sourceFileName,
      realism_mode, job_id,
      background_adherence, composition_fidelity,
    } = body;
    if (!venue_id) return jsonResp({ error: 'venue_id required' }, 400);

    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('[PRO-PHOTO] Missing LOVABLE_API_KEY');
      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error', error_message: 'Missing AI configuration. Contact support.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'AI service not configured.' }, 500);
    }

    // ═══ STEP 1 — Resolve source image ═══
    const { base64: sourceBase64, mime: sourceMime, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ═══ STEP 2 — Build venue style context ═══
    const ctx = await buildVenueStyleContext(supabase, venue_id);
    console.log(`[PRO-PHOTO] Style context: sources=[${ctx.styleSourcesUsed.join(', ')}] refs=${ctx.referenceImages.length}`);

    // ═══ STEP 3 — Build structured generation plan + prompt ═══
    const plan = buildGenerationPlan(
      realism_mode || 'authentic_social',
      background_adherence,
      composition_fidelity,
      ctx.feedbackSignals,
    );
    const prompt = buildPrompt(ctx, plan);

    console.log(`[PRO-PHOTO] Mode=${plan.mode} bg_adherence=${plan.background_adherence} comp_fidelity=${plan.composition_fidelity} prop_invention=${plan.prop_invention}`);

    // Build Gemini message content
    const messageContent: any[] = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${sourceMime};base64,${sourceBase64}` } },
    ];
    for (const ref of ctx.referenceImages) {
      messageContent.push({ type: 'image_url', image_url: { url: ref.url } });
    }

    // ═══ STEP 4 — Call Gemini ═══
    console.log('[PRO-PHOTO] Gemini request started');
    const geminiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: messageContent }],
        modalities: ['image', 'text'],
      }),
    });

    const geminiStatus = geminiResp.status;
    console.log(`[PRO-PHOTO] Gemini response: status=${geminiStatus}`);

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text().catch(() => '');
      console.error(`[PRO-PHOTO] Gemini failed: ${geminiStatus} — ${errBody.substring(0, 500)}`);

      await supabase.from('venue_style_generation_logs').insert({
        venue_id,
        model_name: 'google/gemini-2.5-flash-image',
        prompt_text: prompt.substring(0, 2000),
        style_summary_used: ctx.styleSummary || null,
        reference_asset_ids: ctx.referenceImages.map(r => r.assetId),
        style_sources_used: ctx.styleSourcesUsed,
        dish_lock_applied: true,
        status: 'failed',
        error_json: { status: geminiStatus, body: errBody.substring(0, 1000) },
        duration_ms: Date.now() - startTime,
      }).catch(() => {});

      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error', error_message: 'AI photo generation failed. Please try again.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'AI photo generation failed. Please try again.', gemini_status: geminiStatus }, 502);
    }

    const geminiData = await geminiResp.json();
    const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage || !generatedImage.startsWith('data:image')) {
      console.error('[PRO-PHOTO] Gemini returned no image data');

      await supabase.from('venue_style_generation_logs').insert({
        venue_id,
        model_name: 'google/gemini-2.5-flash-image',
        prompt_text: prompt.substring(0, 2000),
        style_summary_used: ctx.styleSummary || null,
        reference_asset_ids: ctx.referenceImages.map(r => r.assetId),
        style_sources_used: ctx.styleSourcesUsed,
        dish_lock_applied: true,
        status: 'failed',
        error_json: { reason: 'no_image_in_response' },
        duration_ms: Date.now() - startTime,
      }).catch(() => {});

      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error', error_message: 'AI returned no image. Please try again.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'AI returned no image. Please try again.' }, 502);
    }

    // ═══ STEP 5 — Store result ═══
    const imageBase64 = generatedImage.split(',')[1];
    const imgBin = atob(imageBase64);
    const imgBytes = new Uint8Array(imgBin.length);
    for (let i = 0; i < imgBin.length; i++) imgBytes[i] = imgBin.charCodeAt(i);

    const { publicUrl: finalUrl, storagePath: finalStoragePath } = await uploadResultBuffer(
      supabase, venue_id, imgBytes, 'final',
    );

    const generationTimeMs = Date.now() - startTime;

    // ═══ STEP 6 — Save to database ═══
    const finalImageVariants = {
      square_1_1: finalUrl,
      portrait_4_5: finalUrl,
      vertical_9_16: finalUrl,
      _variant_note: 'single_generation_no_real_crops',
    };

    if (job_id) {
      await supabase.from('editor_jobs').update({
        status: 'done',
        final_image_url: finalUrl,
        final_image_variants: finalImageVariants,
        input_image_url: resolvedSourceUrl,
        realism_mode: plan.mode,
        provider_settings: plan as unknown as Record<string, unknown>,
      }).eq('id', job_id);
    }

    const { data: editedAssetData } = await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl],
      output_types: ['image/jpeg'],
      engine_version: 'v2',
      settings_json: {
        realism_mode: plan.mode,
        generation_plan: plan,
        reference_count: ctx.referenceImages.length,
        reference_asset_ids: ctx.referenceImages.map(r => r.assetId),
        model: 'google/gemini-2.5-flash-image',
        generation_time_ms: generationTimeMs,
        style_sources: ctx.styleSourcesUsed,
      },
      created_by: user.id,
      compliance_status: 'approved',
    }).select('id').single();

    // --- Conditional library save ---
    const skipLibrarySave = body.skip_library_save === true;

    let uploadId: string | null = null;
    let outputAssetId: string | null = null;

    if (!skipLibrarySave) {
      const { data: uploadData, error: uploadError } = await supabase.from('uploads').insert({
        venue_id,
        storage_path: finalStoragePath,
        uploaded_by: user.id,
        status: 'ready',
        notes: `Pro Photo · ${plan.mode} (${ctx.referenceImages.length} refs)`,
      }).select('id').single();

      if (uploadError) {
        console.error('[PRO-PHOTO] uploads insert error:', uploadError.message);
      } else {
        uploadId = uploadData?.id || null;
      }

      const modeLabel = plan.mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      try {
        const { data: contentAsset } = await supabase.from('content_assets').insert({
          venue_id,
          created_by: user.id,
          asset_type: 'image',
          source_type: 'generated_image',
          status: 'draft',
          title: `Pro Photo · ${modeLabel}`,
          storage_path: finalStoragePath,
          public_url: finalUrl,
          mime_type: 'image/jpeg',
          source_job_id: editedAssetData?.id || null,
          derived_from_editor_job_id: job_id || null,
          prompt_snapshot: {
            prompt: prompt.substring(0, 2000),
            generation_plan: plan,
          },
          generation_settings: {
            generation_mode: plan.mode,
            generation_plan: plan,
            reference_count: ctx.referenceImages.length,
            model: 'google/gemini-2.5-flash-image',
            generation_time_ms: generationTimeMs,
            style_sources: ctx.styleSourcesUsed,
          },
          metadata: {
            generation_mode: plan.mode,
            edited_asset_id: editedAssetData?.id || null,
            upload_id: uploadId,
          },
        }).select('id').single();
        outputAssetId = contentAsset?.id || null;
      } catch (e) {
        console.warn('[PRO-PHOTO] content_assets insert error:', e);
      }
    } else {
      console.log('[PRO-PHOTO] skip_library_save=true — skipping content_assets & uploads insert');
    }

    // Generation log
    try {
      await supabase.from('venue_style_generation_logs').insert({
        venue_id,
        upload_id: uploadId,
        edited_asset_id: editedAssetData?.id || null,
        model_name: 'google/gemini-2.5-flash-image',
        prompt_text: prompt.substring(0, 2000),
        style_summary_used: ctx.styleSummary || null,
        reference_asset_ids: ctx.referenceImages.map(r => r.assetId),
        style_sources_used: ctx.styleSourcesUsed,
        dish_lock_applied: true,
        retry_count: 0,
        status: 'completed',
        duration_ms: generationTimeMs,
      });
    } catch (e) {
      console.warn('[PRO-PHOTO] generation log insert error:', e);
    }

    console.log(JSON.stringify({
      tag: 'PRO-PHOTO-RESULT',
      job_id: job_id || 'none',
      venue_id,
      mode: plan.mode,
      background_adherence: plan.background_adherence,
      composition_fidelity: plan.composition_fidelity,
      generation_time_ms: generationTimeMs,
    }));

    return jsonResp({
      success: true,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      storage_path: finalStoragePath,
      reference_count: ctx.referenceImages.length,
      background_source: ctx.referenceImages.length > 0 ? 'brand_references' : 'ai_generated',
      style_sources: ctx.styleSourcesUsed,
      style_summary: ctx.styleSummary || null,
      model: 'google/gemini-2.5-flash-image',
      generation_time_ms: generationTimeMs,
      edited_asset_id: editedAssetData?.id || null,
      output_asset_id: outputAssetId,
      generation_mode: plan.mode,
      generation_plan: plan,
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
