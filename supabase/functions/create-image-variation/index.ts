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

function sniffImage(buf: Uint8Array): { ext: string; contentType: string } {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

// ── Variation Strategies ─────────────────────────────────────────────

type VariationStrategy =
  | 'new_angle'
  | 'tighter_crop'
  | 'wider_composition'
  | 'brighter_social'
  | 'darker_editorial'
  | 'dramatic_lighting'
  | 'luxury_setting'
  | 'alternate_styling'
  | 'close_to_original';

interface VariationPlan {
  strategy: VariationStrategy;
  label: string;
  compositionChange: string;
  lightingChange: string;
  backgroundChange: string;
  moodChange: string;
  diversityDirective: string;
}

const VARIATION_PLANS: Record<VariationStrategy, Omit<VariationPlan, 'strategy'>> = {
  new_angle: {
    label: 'New Angle',
    compositionChange: 'Photograph the dish from a SIGNIFICANTLY DIFFERENT angle. If the original was overhead, shoot at 45 degrees. If the original was at eye level, try a dramatic low angle or overhead. The viewer should immediately see a different perspective.',
    lightingChange: 'Adjust lighting to complement the new angle — ensure highlights and shadows work with the new perspective.',
    backgroundChange: 'Adapt background composition to the new viewpoint. Show different background elements that would be visible from this new angle.',
    moodChange: 'Maintain the same mood and atmosphere but from a fresh perspective.',
    diversityDirective: 'The new angle must be CLEARLY DIFFERENT from the original — not a 5-degree shift but a fundamentally different viewpoint.',
  },
  tighter_crop: {
    label: 'Tighter Crop',
    compositionChange: 'Move significantly closer to the dish. Fill 80-90% of the frame with the food. Show texture detail, ingredient close-ups, and surface quality. This should feel like a detail macro shot.',
    lightingChange: 'Use tighter, more focused lighting that reveals food textures — glossy surfaces, grain, steam, moisture.',
    backgroundChange: 'Minimize background. Only the plate edge and immediate surroundings should be visible, heavily blurred.',
    moodChange: 'Create an intimate, appetite-inducing close-up feel. This is about making the viewer hungry.',
    diversityDirective: 'The crop must be DRAMATICALLY tighter than the original. This is not a small zoom — it is a macro-style food detail shot.',
  },
  wider_composition: {
    label: 'Wider Scene',
    compositionChange: 'Pull back to show more of the restaurant environment around the dish. Include table setting, surrounding decor, ambient context. The dish should be in the scene but the setting tells a story.',
    lightingChange: 'Show environmental lighting — restaurant ambiance, candle glow, window light, or overhead fixtures.',
    backgroundChange: 'Include restaurant interior details: other tables, wall textures, decorative elements, depth of the room.',
    moodChange: 'Create a lifestyle, "dining experience" feel rather than a food-focused shot.',
    diversityDirective: 'Show at least 40% more environment than the original. This is a scene shot, not just a food photo.',
  },
  brighter_social: {
    label: 'Bright & Social',
    compositionChange: 'Use a clean, well-balanced composition optimized for social media impact. Bright, airy, and inviting.',
    lightingChange: 'Bright, warm, natural-looking light. High key lighting with minimal shadows. Sunny, daytime restaurant ambiance. Think "Instagram brunch photo" quality.',
    backgroundChange: 'Light, clean background — white or light wood table, fresh flowers, bright environment. Remove dark or moody elements.',
    moodChange: 'Cheerful, inviting, fresh, and vibrant. This should feel energetic and shareable.',
    diversityDirective: 'This must feel VISUALLY LIGHTER and BRIGHTER than the original. If the original was already bright, push further into airy, high-key territory.',
  },
  darker_editorial: {
    label: 'Dark Editorial',
    compositionChange: 'Use dramatic, editorial composition with intentional negative space and strong visual weight.',
    lightingChange: 'Dramatic low-key lighting. Strong directional light from one side, deep shadows on the other. Chiaroscuro effect. Rich, warm highlights against dark surroundings.',
    backgroundChange: 'Dark, moody background — dark wood, black marble, or deep-toned surfaces. Minimal bright elements. The dish should glow against darkness.',
    moodChange: 'Sophisticated, mysterious, premium. Think high-end magazine or Michelin-star restaurant photography.',
    diversityDirective: 'This must feel DRAMATICALLY DARKER and MOODIER than the original. Strong contrast between light on food and dark surroundings.',
  },
  dramatic_lighting: {
    label: 'Dramatic Light',
    compositionChange: 'Compose to maximize the impact of dramatic lighting. Position the dish where light and shadow create the most visual interest.',
    lightingChange: 'Extreme directional lighting — strong spotlight effect from one direction. Create pronounced long shadows, bright highlights, and rich mid-tones. Add rim lighting to separate the dish from background.',
    backgroundChange: 'Background should complement the dramatic lighting — dark areas with pockets of light, bokeh, or atmospheric haze.',
    moodChange: 'Theatrical, cinematic, visually striking. The lighting is the star alongside the food.',
    diversityDirective: 'The lighting must be DRAMATICALLY DIFFERENT from the original — this is not a subtle change but a complete re-lighting.',
  },
  luxury_setting: {
    label: 'Luxury Setting',
    compositionChange: 'Elegant composition with premium styling. Include luxury table elements and refined negative space.',
    lightingChange: 'Warm, golden lighting suggesting candlelight or premium restaurant ambiance. Gentle, flattering light.',
    backgroundChange: 'Replace background with luxury elements: marble surface, crystal glassware, fine cutlery, linen napkin, wine glass. Premium, aspirational setting.',
    moodChange: 'Exclusive, refined, aspirational. This should look like a premium dining advertisement.',
    diversityDirective: 'The setting must feel NOTICEABLY MORE PREMIUM than the original. Add luxury environmental elements that were not present before.',
  },
  alternate_styling: {
    label: 'Alt Styling',
    compositionChange: 'Keep a similar angle but change the visual styling completely — different table surface, different props, different color story.',
    lightingChange: 'Change the lighting mood — if original was warm, go cooler. If original was bright, add more shadow contrast.',
    backgroundChange: 'Use a completely different table surface and surrounding props. Different color palette for the environment while keeping the dish unchanged.',
    moodChange: 'Create a distinctly different visual story around the same dish. This is like re-styling the set.',
    diversityDirective: 'The ENVIRONMENT must look completely different while the DISH remains identical. A viewer should recognize the food but not the setting.',
  },
  close_to_original: {
    label: 'Subtle Refresh',
    compositionChange: 'Keep composition very similar. Only make minor adjustments to improve balance.',
    lightingChange: 'Make a noticeable but subtle lighting change — slightly warmer, or add a gentle fill light, or soften shadows.',
    backgroundChange: 'Keep background similar but freshen it slightly — cleaner surface, tidier props, slightly different background blur.',
    moodChange: 'Same general mood but refreshed — like a "take two" of the same setup.',
    diversityDirective: 'Although close to the original, there must be at least ONE clearly visible difference — a lighting shift, a prop change, or a subtle crop adjustment. It cannot be identical.',
  },
};

const AUTO_ROTATION_ORDER: VariationStrategy[] = [
  'new_angle',
  'dramatic_lighting',
  'tighter_crop',
  'luxury_setting',
  'brighter_social',
  'darker_editorial',
  'wider_composition',
  'alternate_styling',
];

function selectAutoStrategy(siblingCount: number): VariationStrategy {
  return AUTO_ROTATION_ORDER[siblingCount % AUTO_ROTATION_ORDER.length];
}

function buildVariationPrompt(
  plan: VariationPlan,
  parentMode: string,
  notes?: string,
): string {
  return `You are creating a VARIATION of an existing restaurant food photograph.
This variation uses the "${plan.label}" strategy.

CRITICAL — DISH LOCK (ABSOLUTE RULES):
- The food must remain VISUALLY IDENTICAL to the source image.
- Same dish, same ingredients, same plating, same portion, same crockery.
- Do NOT add garnish, remove ingredients, or change the plate.
- Treat the food region as locked pixels.
- Do NOT add text, watermarks, or overlays.
- Do NOT make it look artificial or illustrated.

═══ VARIATION STRATEGY: ${plan.label.toUpperCase()} ═══

COMPOSITION:
${plan.compositionChange}

LIGHTING:
${plan.lightingChange}

BACKGROUND:
${plan.backgroundChange}

MOOD:
${plan.moodChange}

DIVERSITY REQUIREMENT:
${plan.diversityDirective}

ANTI-DUPLICATION:
- This image must be VISIBLY DIFFERENT from the parent image.
- A person viewing both side-by-side must immediately see meaningful differences.
- If the result would look nearly identical to the parent, push harder on the variation strategy.
- Do NOT produce a near-duplicate with only pixel-level differences.

Parent image mode was: ${parentMode || 'safe'}.
${notes ? `Additional notes: ${notes}` : ''}

The result must be a professional restaurant marketing photograph.
Output as JPEG.`.trim();
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
    const { parent_asset_id, venue_id, variation_mode, notes, realism_mode_override } = body;

    if (!parent_asset_id || !venue_id) {
      return jsonResp({ error: 'parent_asset_id and venue_id required' }, 400);
    }

    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    // Load parent asset
    const { data: parent, error: parentErr } = await supabase
      .from('content_assets')
      .select('*')
      .eq('id', parent_asset_id)
      .eq('venue_id', venue_id)
      .single();

    if (parentErr || !parent) return jsonResp({ error: 'Parent asset not found' }, 404);
    if (parent.asset_type !== 'image') return jsonResp({ error: 'Parent must be an image asset' }, 400);

    // Resolve source image URL
    let sourceImageUrl = parent.public_url;
    if (!sourceImageUrl && parent.storage_path) {
      const { data: signedData } = await supabase.storage
        .from('venue-assets')
        .createSignedUrl(parent.storage_path, 600);
      sourceImageUrl = signedData?.signedUrl;
    }
    if (!sourceImageUrl) return jsonResp({ error: 'Could not resolve parent image URL' }, 400);

    // Determine parent mode from metadata
    const parentSettings = (parent.generation_settings || {}) as Record<string, unknown>;
    const parentMetadata = (parent.metadata || {}) as Record<string, unknown>;
    const parentMode = (parentMetadata.generation_mode as string) || (parentSettings.generation_mode as string) || (parentSettings.realism_mode as string) || 'safe';

    // Determine lineage
    const rootAssetId = parent.root_asset_id || parent.id;
    const lineageDepth = (parent.lineage_depth || 0) + 1;

    // Count existing siblings to rotate auto-strategy
    const { count: siblingCount } = await supabase
      .from('content_assets')
      .select('id', { count: 'exact', head: true })
      .eq('parent_asset_id', parent_asset_id)
      .eq('venue_id', venue_id);

    // Determine variation strategy
    const requestedStrategy = (variation_mode as VariationStrategy) || null;
    const strategy: VariationStrategy = requestedStrategy && VARIATION_PLANS[requestedStrategy]
      ? requestedStrategy
      : selectAutoStrategy(siblingCount || 0);

    const strategyConfig = VARIATION_PLANS[strategy];
    const variationPlan: VariationPlan = { strategy, ...strategyConfig };

    // Check AI config
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return jsonResp({ error: 'AI service not configured.' }, 500);
    }

    // Fetch source image bytes
    const imgResp = await fetch(sourceImageUrl);
    if (!imgResp.ok) return jsonResp({ error: 'Failed to fetch parent image' }, 500);
    const imgBuf = new Uint8Array(await imgResp.arrayBuffer());
    let binary = '';
    for (let i = 0; i < imgBuf.length; i++) binary += String.fromCharCode(imgBuf[i]);
    const base64 = btoa(binary);
    const mime = imgResp.headers.get('content-type') || 'image/jpeg';

    // Build variation prompt
    const variationPrompt = buildVariationPrompt(variationPlan, parentMode, notes);

    const messageContent: unknown[] = [
      { type: 'text', text: variationPrompt },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
    ];

    console.log(`[VARIATION] parent=${parent_asset_id} strategy=${strategy} label="${strategyConfig.label}" siblings=${siblingCount || 0}`);

    const startTime = Date.now();
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

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text().catch(() => '');
      console.error(`[VARIATION] AI failed: ${geminiResp.status} — ${errBody.substring(0, 500)}`);

      await supabase.from('content_assets').insert({
        venue_id,
        created_by: user.id,
        asset_type: 'image',
        source_type: 'variation',
        status: 'failed',
        title: `Variation · ${strategyConfig.label}`,
        parent_asset_id,
        root_asset_id: rootAssetId,
        lineage_depth: lineageDepth,
        prompt_snapshot: { prompt: variationPrompt, variation_plan: variationPlan },
        generation_settings: { variation_strategy: strategy, parent_mode: parentMode },
        metadata: { error: 'AI generation failed', notes, variation_strategy: strategy },
      });

      return jsonResp({ error: 'AI variation generation failed. Please try again.' }, 502);
    }

    const geminiData = await geminiResp.json();
    const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage || !generatedImage.startsWith('data:image')) {
      console.error('[VARIATION] AI returned no image');
      return jsonResp({ error: 'AI returned no image. Please try again.' }, 502);
    }

    // Store result
    const imageBase64 = generatedImage.split(',')[1];
    const imgBin = atob(imageBase64);
    const resultBytes = new Uint8Array(imgBin.length);
    for (let i = 0; i < imgBin.length; i++) resultBytes[i] = imgBin.charCodeAt(i);

    const { ext, contentType } = sniffImage(resultBytes);
    const storagePath = `venues/${venue_id}/edited/${crypto.randomUUID()}_variation.${ext}`;

    await supabase.storage.from('venue-assets').upload(storagePath, resultBytes, { contentType });

    const { data: signedData } = await supabase.storage
      .from('venue-assets')
      .createSignedUrl(storagePath, 86400);
    const publicUrl = signedData?.signedUrl || '';

    const generationTimeMs = Date.now() - startTime;

    // Build title reflecting real generation info
    const parentTitle = parent.title || 'Pro Photo';
    const modeLabel = parentMode.charAt(0).toUpperCase() + parentMode.slice(1);
    const title = `Variation · ${modeLabel} · ${strategyConfig.label}`;

    // Create content_assets record with proper lineage
    const { data: newAsset, error: insertErr } = await supabase.from('content_assets').insert({
      venue_id,
      created_by: user.id,
      asset_type: 'image',
      source_type: 'variation',
      status: 'draft',
      title,
      parent_asset_id,
      root_asset_id: rootAssetId,
      lineage_depth: lineageDepth,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: contentType,
      prompt_snapshot: {
        prompt: variationPrompt,
        variation_plan: variationPlan,
      },
      generation_settings: {
        variation_strategy: strategy,
        variation_label: strategyConfig.label,
        parent_mode: parentMode,
        model: 'google/gemini-2.5-flash-image',
        generation_time_ms: generationTimeMs,
        parent_settings: parentSettings,
      },
      metadata: {
        notes: notes || null,
        variation_strategy: strategy,
        variation_label: strategyConfig.label,
        generation_mode: parentMode,
        parent_title: parentTitle,
      },
    }).select('*').single();

    if (insertErr) {
      console.error('[VARIATION] Insert error:', insertErr);
      return jsonResp({ error: 'Failed to save variation' }, 500);
    }

    console.log(`[VARIATION] Success: asset=${newAsset.id} strategy=${strategy} time=${generationTimeMs}ms`);

    return jsonResp({
      success: true,
      asset: newAsset,
      generation_time_ms: generationTimeMs,
      variation_strategy: strategy,
      variation_label: strategyConfig.label,
    });
  } catch (err: unknown) {
    console.error('[VARIATION] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
