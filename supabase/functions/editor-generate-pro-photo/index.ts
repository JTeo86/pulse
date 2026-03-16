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
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType });
  // Return only the permanent storage path — never persist signed URLs
  return { publicUrl: '', storagePath: path };
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
}

async function buildVenueStyleContext(
  supabase: any,
  venueId: string,
): Promise<VenueStyleContext> {
  const styleSourcesUsed: string[] = [];

  const [venueResult, brandKitResult, styleProfileResult, refAssetsResult, legacyRefResult] = await Promise.all([
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
    styleSourcesUsed, venueName, venueCity,
  };
}

// ── Structured Generation Plan ───────────────────────────────────────

interface GenerationPlan {
  mode: string;
  preservation_level: number;       // 0.0–1.0, higher = more faithful to original
  composition_flexibility: number;  // 0.0–1.0, higher = more freedom to reframe
  background_flexibility: number;   // 0.0–1.0, higher = more background change allowed
  plating_refinement: number;       // 0.0–1.0, higher = more plating enhancement
  lighting_drama: number;           // 0.0–1.0, higher = more dramatic lighting
  styling_intensity: number;        // 0.0–1.0, higher = more environmental styling
  realism_guardrails: string;
}

function buildGenerationPlan(realismMode: string): GenerationPlan {
  switch (realismMode) {
    case 'safe':
      return {
        mode: 'safe',
        preservation_level: 0.95,
        composition_flexibility: 0.05,
        background_flexibility: 0.15,
        plating_refinement: 0.05,
        lighting_drama: 0.1,
        styling_intensity: 0.1,
        realism_guardrails: 'strict',
      };
    case 'enhanced':
      return {
        mode: 'enhanced',
        preservation_level: 0.7,
        composition_flexibility: 0.3,
        background_flexibility: 0.5,
        plating_refinement: 0.3,
        lighting_drama: 0.45,
        styling_intensity: 0.5,
        realism_guardrails: 'moderate',
      };
    case 'editorial':
      return {
        mode: 'editorial',
        preservation_level: 0.4,
        composition_flexibility: 0.7,
        background_flexibility: 0.85,
        plating_refinement: 0.5,
        lighting_drama: 0.85,
        styling_intensity: 0.9,
        realism_guardrails: 'relaxed',
      };
    default:
      return buildGenerationPlan('safe');
  }
}

// ── Prompt Construction from Generation Plan ─────────────────────────

function buildPrompt(ctx: VenueStyleContext, plan: GenerationPlan): string {
  const toneMap: Record<string, string> = {
    casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
    premium: 'upscale fine dining restaurant with dark wood, candlelight, and luxury tableware',
    luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
    nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
    family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
  };
  const venueTone = toneMap[ctx.venueTone] || toneMap.casual;
  const hasRefs = ctx.referenceImages.length > 0;

  // ── DISH LOCK — always strict regardless of mode ──
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

  // ── MODE-SPECIFIC SECTIONS ──
  // These are DRAMATICALLY different per mode to prevent output collapse

  let compositionDirective: string;
  let backgroundDirective: string;
  let lightingDirective: string;
  let polishDirective: string;
  let environmentDirective: string;
  let modeGoal: string;

  if (plan.mode === 'safe') {
    compositionDirective = `COMPOSITION — PRESERVE EXACTLY:
- Keep the EXACT same camera angle, framing, and crop as the original photo.
- Do NOT rotate, tilt, zoom, or reframe the shot.
- The dish must remain in the same position within the frame.
- Do NOT add or remove any negative space.
- Maintain the original aspect ratio and perspective.`;

    backgroundDirective = `BACKGROUND — MINIMAL CLEANUP ONLY:
- Keep the original background as much as possible.
- Only remove obvious distractions (trash, fingers, phone edges).
- Do NOT replace the table surface, tablecloth, or setting.
- Do NOT add props, decorations, or styling elements.
- The scene should look like the same photo, just cleaner.`;

    lightingDirective = `LIGHTING — GENTLE CORRECTION ONLY:
- Correct white balance if the image has a color cast.
- Fix minor underexposure or overexposure.
- Do NOT add dramatic directional lighting.
- Do NOT add rim lighting, backlighting, or spotlight effects.
- Preserve the original natural shadow directions.
- Keep the ambient light character of the original scene.`;

    polishDirective = `POLISH — SUBTLE PROFESSIONAL CLEANUP:
- Slightly sharpen for clarity.
- Minor noise reduction if needed.
- Subtle contrast adjustment only.
- The output should look like the original photo taken with a slightly better camera.
- No visible editing or retouching.`;

    environmentDirective = `ENVIRONMENT — DO NOT CHANGE:
- Keep existing tableware, napkins, cutlery, glasses.
- Do NOT add new props or table accessories.
- Do NOT upgrade or change the crockery.
- Preserve the authentic restaurant environment.`;

    modeGoal = `The output must look like the exact same photograph, cleaned up by a professional photographer in post-processing. A viewer comparing original and output should see the SAME scene, just better exposed and sharper.`;

  } else if (plan.mode === 'enhanced') {
    compositionDirective = `COMPOSITION — MODERATE REFINEMENT:
- You may slightly adjust the framing to improve the composition.
- Minor crop adjustments are acceptable to follow rule-of-thirds.
- Keep the same general camera angle but you may subtly improve it.
- Center the dish better if it's off-center in an unpleasing way.
- Do NOT dramatically change the perspective or angle.`;

    backgroundDirective = `BACKGROUND — REFINED RESTAURANT SETTING:
- Clean up and refine the background to look polished.
- Replace messy or distracting backgrounds with a clean, believable restaurant table setting.
- Add subtle depth with a naturally blurred background suggesting a real restaurant interior.
- Use warm, inviting restaurant tones — wooden tables, clean linen, or elegant surfaces.
- The background should look like a real, well-maintained restaurant — not a studio.`;

    lightingDirective = `LIGHTING — PROFESSIONAL FOOD PHOTOGRAPHY:
- Apply professional soft directional lighting from a 45-degree angle.
- Add gentle fill light to reduce harsh shadows under the dish.
- Create natural-looking highlights on the food surface to make it glisten.
- Use warm color temperature (around 4500K) for an inviting restaurant feel.
- Add moderate depth-of-field — gently blur background while keeping the full dish sharp.
- Add subtle catchlights on sauces, glazes, or moist surfaces.`;

    polishDirective = `POLISH — SOCIAL-MEDIA READY:
- Increase micro-contrast on the food for texture pop.
- Boost color saturation moderately — make colors vibrant but natural.
- Apply professional sharpening to the dish area.
- The image should feel "Instagram-worthy" — clearly better than a phone snapshot.
- Professional but not overdone — it should still look authentic.`;

    environmentDirective = `ENVIRONMENT — TASTEFUL UPGRADE:
- You may add simple, elegant props: a clean napkin, a fork, a small glass.
- Props should be minimal and not compete with the dish.
- Ensure tableware looks clean and appropriate for the venue type.
- The table setting should suggest a real restaurant experience.`;

    modeGoal = `The output should look noticeably better than the original — like a professional food photographer captured it with proper lighting equipment in a well-styled restaurant. It should feel authentic and real, but clearly elevated.`;

  } else {
    // editorial
    compositionDirective = `COMPOSITION — CREATIVE FREEDOM:
- Recompose for maximum visual impact. Use dramatic framing.
- Apply the rule of thirds, golden ratio, or asymmetric balance.
- You may shoot from a more dramatic angle — lower perspective, close-up detail, or elegant overhead.
- Use negative space deliberately for a magazine-layout feel.
- Create a composition that would work as a full-page magazine ad or hero banner.`;

    backgroundDirective = `BACKGROUND — PREMIUM EDITORIAL ENVIRONMENT:
- Create a rich, luxurious restaurant environment with depth and atmosphere.
- Use moody, textured backgrounds — dark marble, rich wood, or elegant stone surfaces.
- Add environmental storytelling: candlelight reflections, bokeh from distant lights, subtle ambient elements.
- The setting should feel exclusive and aspirational.
- Add atmospheric depth — slight haze, warm ambient glow, or dramatic light falloff.
- The background should support the dish as the hero, not compete with it.`;

    lightingDirective = `LIGHTING — CINEMATIC & DRAMATIC:
- Use dramatic directional lighting — strong key light from one side creating pronounced shadows.
- Add beautiful rim lighting or edge light to separate the dish from the background.
- Create deep, rich shadows alongside bright highlights for maximum contrast.
- Use warm golden tones mixed with cool shadow areas for cinematic color contrast.
- Apply strong shallow depth-of-field with creamy, luxurious bokeh.
- Add specular highlights on sauces, oils, and glossy surfaces to make them shine.
- The lighting should feel intentional, editorial, and magazine-quality.`;

    polishDirective = `POLISH — HIGH-END MAGAZINE FINISH:
- Maximum professional retouching — every detail should be perfected.
- Rich, deep colors with controlled saturation for a premium feel.
- Pronounced micro-contrast for dramatic texture detail on the food.
- Cinematic color grading — this is not a casual photo, it's a campaign image.
- The overall tone should feel luxurious, warm, and aspirational.`;

    environmentDirective = `ENVIRONMENT — LUXURY STYLING:
- Add premium styling elements: elegant cutlery, linen, crystal, or wine glass.
- Use sophisticated color palette in the props and surfaces.
- Every element should reinforce a premium dining narrative.
- The scene should look like it was styled by a professional food stylist for a luxury magazine shoot.
- Include subtle premium details: fabric texture, reflective surfaces, fine tableware.`;

    modeGoal = `The output should look dramatically different from a phone photo — like a premium ad campaign or magazine editorial. Think Michelin-starred restaurant marketing, luxury hotel campaign, or high-end food magazine cover. The dish is the hero in a cinematic, aspirational scene.`;
  }

  const refInstruction = hasRefs
    ? `Match the specific lighting mood, table surfaces, interior atmosphere, and color palette of the provided reference images.`
    : `Generate a restaurant table environment matching this style: ${venueTone}.${ctx.venueCity ? ` Located in ${ctx.venueCity}.` : ''}`;

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

VENUE REFERENCE:
${refInstruction}
${ctx.venueName ? `Venue: "${ctx.venueName}"` : ''}
${ctx.brandSummary ? `Brand notes: ${ctx.brandSummary.substring(0, 400)}` : ''}

GOAL:
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
    const { venue_id, input_image_url, sourceFileBase64, sourceFileName, realism_mode, job_id } = body;
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
    const plan = buildGenerationPlan(realism_mode || 'safe');
    const prompt = buildPrompt(ctx, plan);

    console.log(`[PRO-PHOTO] Mode=${plan.mode} preservation=${plan.preservation_level} lighting_drama=${plan.lighting_drama} bg_flex=${plan.background_flexibility}`);

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

    // ═══ STEP 6 — Save to database (honest metadata) ═══
    // NOTE: All format variants point to the same URL because only one image is generated.
    // They are labeled as "same_source" to be honest about this limitation.
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

    let uploadId: string | null = null;
    const { data: uploadData, error: uploadError } = await supabase.from('uploads').insert({
      venue_id,
      storage_path: finalStoragePath,
      uploaded_by: user.id,
      status: 'ready',
      notes: `Pro Photo · ${plan.mode.charAt(0).toUpperCase() + plan.mode.slice(1)} (${ctx.referenceImages.length} refs)`,
    }).select('id').single();

    if (uploadError) {
      console.error('[PRO-PHOTO] uploads insert error:', uploadError.message);
    } else {
      uploadId = uploadData?.id || null;
    }

    // Content assets record with proper generation metadata
    const modeLabel = plan.mode.charAt(0).toUpperCase() + plan.mode.slice(1);
    let outputAssetId: string | null = null;
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
      preservation_level: plan.preservation_level,
      lighting_drama: plan.lighting_drama,
      generation_time_ms: generationTimeMs,
    }));

    return jsonResp({
      success: true,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
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
