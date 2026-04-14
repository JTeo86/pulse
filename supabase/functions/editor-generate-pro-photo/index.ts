import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveAiConfig, resolveModelForTask, chatCompletionsUrl } from '../_shared/ai-key-resolver.ts';
import { buildImageStyleDirectives, resolveVenueStyle } from '../_shared/venue-style.ts';

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
  const { error: uploadError } = await supabase.storage.from('content-library').upload(path, buffer, { contentType });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
  const { data: signedData, error: signError } = await supabase.storage
    .from('content-library')
    .createSignedUrl(path, 60 * 60 * 24 * 365);
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
    await supabase.storage.from('asset-pool').upload(path, bytes, { contentType: mime });
    const { data: signedData } = await supabase.storage.from('asset-pool').createSignedUrl(path, 86400);
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
  styleSource: 'selected' | 'inferred';
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
    for (const asset of newAssets) {
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
      for (const asset of legacyAssets) {
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
  const resolvedStyle = resolveVenueStyle({
    profile: sp,
    brandKit: brandKitResult.data,
    venue: venueResult.data,
    recentAssets: newAssets,
    recentContent: [],
  });
  styleSourcesUsed.push(`style_${resolvedStyle.source}`);

  return {
    brandSummary,
    styleSummary,
    lightingMood: lightingMood || resolvedStyle.vibe,
    luxuryLevel,
    cuisineType: cuisineType || resolvedStyle.cuisine,
    venueTone: resolvedStyle.tone || brandPreset,
    negativeRules,
    dishLockRules,
    referenceImages,
    styleSourcesUsed,
    venueName,
    venueCity,
    styleSource: resolvedStyle.source,
  };
}

type GenerationMode = 'social_ready' | 'backdrop' | 'campaign';

function normalizeMode(mode: string | undefined): GenerationMode {
  return mode === 'backdrop' || mode === 'campaign' ? mode : 'social_ready';
}

function buildPrompt(ctx: VenueStyleContext, mode: GenerationMode): string {
  const dishLockExtra = ctx.dishLockRules.length > 0
    ? `\n${ctx.dishLockRules.map((rule) => `- ${rule}`).join('\n')}`
    : '';

  const brandContext = [ctx.brandSummary, ctx.styleSummary].filter(Boolean).join(' | ');
  const styleDirectives = buildImageStyleDirectives(resolveVenueStyle({
    profile: {
      cuisine_type: ctx.cuisineType,
      venue_tone: ctx.venueTone,
      lighting_mood: ctx.lightingMood,
    },
  })).map((line) => `- ${line}`).join('\n');
  const lightingGuide = ctx.lightingMood || `${ctx.venueTone} restaurant lighting`;

  const baseStructuredSections = `
PRO PHOTO SYSTEM: STRUCTURED_FOOD_REALISM_V2

1) OBJECTIVE
- Create a realistic, high-quality food photo suitable for premium hospitality marketing.
- Keep the output natural, editorial, and believable.

2) DISH INTEGRITY (STRICT)
- Preserve the exact dish identity, ingredients, portion size, plating layout, and crockery.
- Do not add ingredients, remove ingredients, or alter food anatomy.
- Do not distort plate geometry, garnish placement, or serving proportions.
- No additions or distortions.${dishLockExtra}

3) VENUE STYLE ALIGNMENT
- Match venue identity, tone, vibe, and cuisine.
- Venue name: ${ctx.venueName}${ctx.venueCity ? ` (${ctx.venueCity})` : ''}.
- Venue tone: ${ctx.venueTone || 'premium casual'}.
- Cuisine direction: ${ctx.cuisineType || 'restaurant-authentic'}.
- Brand summary: ${brandContext || 'Use restrained, premium restaurant visual language.'}

4) SCENE COMPOSITION
- Keep a clean, minimal environment.
- Avoid clutter and visual noise.
- Ensure the dish is the hero with realistic depth and spacing.

5) LIGHTING
- Apply lighting that matches venue vibe: ${lightingGuide}.
- Use natural highlight rolloff and plausible shadows.
- Avoid blown highlights, crushed shadows, or theatrical lighting unless explicitly mode-required.

6) STRICT CONSTRAINTS
- No artificial garnish.
- No unrealistic textures.
- No over-enhancement.
- Avoid AI artifacts, synthetic edges, waxy surfaces, repeated patterns, and warped utensils.
`;

  if (mode === 'social_ready') {
    return `You are a professional food photo retoucher.

MODE: SOCIAL_READY
Goal: Improve the original image without changing the scene.

${baseStructuredSections}

MANDATORY RULES:
- preserve original scene
- do not change environment
- no new elements
- preserve original composition
- preserve original angle
- preserve background
- no scene generation
- no new props
- no environment change

ALLOWED ADJUSTMENTS ONLY:
- exposure correction
- white balance correction
- contrast
- colour cleanup
- sharpening
- noise reduction
- minor cleanup
- slight crop/reframe

FOOD FIDELITY (STRICT):
- Preserve exact dish identity, ingredients, plating, and portion.
- Do not add garnish or remove ingredients.
- Do not alter crockery.
- Keep food realistic, not stylized.${dishLockExtra}

BRAND CONTEXT:
${brandContext || 'Use subtle, natural retouching with authentic restaurant realism.'}

VENUE STYLE DIRECTIVES:
${styleDirectives}

NEGATIVE RULES:
${ctx.negativeRules.length ? ctx.negativeRules.map((r) => `- ${r}`).join('\n') : '- Do not make the result look AI-generated or over-processed.'}

Output as JPEG.`;
  }

  if (mode === 'backdrop') {
    return `You are a food image compositor.

MODE: BACKDROP
Goal: Keep the dish, replace the background with a controlled surface.

${baseStructuredSections}

REQUIRED PIPELINE:
1) isolate dish
2) enhance dish
3) place on new surface

MANDATORY RULES:
- single continuous surface
- no wall or split background
- realistic shadow under dish
- keep dish identity intact
- keep plating and crockery accurate

ABSOLUTE NEGATIVES:
- NO room scenes
- NO walls
- NO furniture
- NO restaurant environments
- NO horizon lines
- no new props except existing dish/plating context

BACKGROUND GUIDANCE:
- Prefer simple neutral textures.
- If venue references are provided, use venue-approved surfaces only.
- Keep the surface believable and clean.

BRAND CONTEXT:
${brandContext || 'Use an authentic, clean branded look.'}

VENUE STYLE DIRECTIVES:
${styleDirectives}

NEGATIVE RULES:
${ctx.negativeRules.length ? ctx.negativeRules.map((r) => `- ${r}`).join('\n') : '- Avoid generic AI-styled environments.'}

Output as JPEG.`;
  }

  return `You are a food campaign image creator.

MODE: CAMPAIGN
Goal: Stylized promotional image.

${baseStructuredSections}

MANDATORY RULES:
- allow creativity
- allow lighting changes
- preserve dish identity
- avoid unrealistic food appearance

CAMPAIGN GUIDANCE:
- Create high-impact promotional styling.
- You may creatively reshape the environment and lighting.
- Keep the dish as the clear hero.
- Do not make food anatomy unrealistic.

BRAND CONTEXT:
${brandContext || 'Premium but believable restaurant marketing style.'}

VENUE STYLE DIRECTIVES:
${styleDirectives}

NEGATIVE RULES:
${ctx.negativeRules.length ? ctx.negativeRules.map((r) => `- ${r}`).join('\n') : '- Avoid uncanny or synthetic food textures.'}

Output as JPEG.`;
}

function getModePlan(mode: GenerationMode) {
  if (mode === 'social_ready') {
    return {
      mode,
      pipeline: ['enhance_original_only'],
      allow_scene_generation: false,
      allow_new_props: false,
      preserve_environment: true,
    };
  }
  if (mode === 'backdrop') {
    return {
      mode,
      pipeline: ['isolate_dish', 'enhance_dish', 'generate_surface', 'composite'],
      allow_scene_generation: false,
      allow_new_props: false,
      preserve_environment: false,
    };
  }
  return {
    mode,
    pipeline: ['full_generation_campaign'],
    allow_scene_generation: true,
    allow_new_props: true,
    preserve_environment: false,
  };
}

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

    const currentMonth = new Date().toISOString().slice(0, 7);
    const [entitlementsRes, usageRes, enforcementRes] = await Promise.all([
      supabase.from('venue_entitlements').select('monthly_image_quota').eq('venue_id', venue_id).maybeSingle(),
      supabase.from('editor_usage').select('pro_photo_used').eq('venue_id', venue_id).eq('month', currentMonth).maybeSingle(),
      supabase.from('platform_settings').select('value').eq('key', 'billing_enforcement_mode').maybeSingle(),
    ]);
    const quota = entitlementsRes.data?.monthly_image_quota ?? 0;
    const used = usageRes.data?.pro_photo_used ?? 0;
    const enforcementMode = (enforcementRes.data?.value ?? 'soft').toLowerCase();
    const overQuota = quota > 0 && used >= quota;
    let generationWarning: string | null = null;
    if (overQuota && enforcementMode === 'hard') {
      return jsonResp({ error: `Monthly image quota reached (${used}/${quota}). Upgrade your plan to continue.` }, 402);
    }
    if (overQuota) {
      generationWarning = `Monthly image quota reached (${used}/${quota}). Soft enforcement mode allows generation.`;
    }

    let aiConfig: Awaited<ReturnType<typeof resolveAiConfig>>;
    try {
      aiConfig = await resolveAiConfig();
    } catch (e) {
      console.error('[PRO-PHOTO] AI not configured:', (e as Error).message);
      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: 'AI not configured. Set GOOGLE_AI_API_KEY in Admin → Integrations.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'AI service not configured.' }, 500);
    }

    const { base64: sourceBase64, mime: sourceMime, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    const ctx = await buildVenueStyleContext(supabase, venue_id);
    const mode = normalizeMode(realism_mode);
    const plan = getModePlan(mode);
    const prompt = buildPrompt(ctx, mode);

    console.log(`[PRO-PHOTO] mode=${mode} refs=${ctx.referenceImages.length}`);

    const referenceLimit = mode === 'backdrop' ? 6 : mode === 'campaign' ? 4 : 2;
    const selectedReferences = ctx.referenceImages.slice(0, referenceLimit);

    const messageContent: any[] = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${sourceMime};base64,${sourceBase64}` } },
    ];
    for (const ref of selectedReferences) {
      messageContent.push({ type: 'image_url', image_url: { url: ref.url } });
    }

    let generatedImage: string | undefined;

    if (aiConfig.source === 'platform_api_keys') {
      const nativeModel = resolveModelForTask('pro_photo', aiConfig);
      const nativeEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${nativeModel}:generateContent?key=${aiConfig.apiKey}`;
      const geminiParts: any[] = [{ text: prompt }];
      geminiParts.push({ inlineData: { mimeType: sourceMime, data: sourceBase64 } });

      for (const ref of selectedReferences) {
        if (ref.url.startsWith('data:')) {
          const dataMatch = ref.url.match(/^data:([^;]+);base64,(.+)$/);
          if (dataMatch) geminiParts.push({ inlineData: { mimeType: dataMatch[1], data: dataMatch[2] } });
        } else {
          geminiParts.push({ fileData: { fileUri: ref.url, mimeType: 'image/jpeg' } });
        }
      }

      const geminiResp = await fetch(nativeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: geminiParts }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            maxOutputTokens: 8192,
          },
        }),
      });

      if (!geminiResp.ok) {
        const errBody = await geminiResp.text().catch(() => '');
        if (job_id) {
          await supabase.from('editor_jobs').update({
            status: 'error',
            error_message: 'AI photo generation failed. Please try again.',
          }).eq('id', job_id);
        }
        return jsonResp({ error: 'AI photo generation failed. Please try again.', details: errBody.substring(0, 500) }, 502);
      }

      const geminiData = await geminiResp.json();
      const parts = geminiData?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          generatedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    } else {
      const geminiResp = await fetch(chatCompletionsUrl(aiConfig), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolveModelForTask('pro_photo', aiConfig),
          messages: [{ role: 'user', content: messageContent }],
          modalities: ['image', 'text'],
        }),
      });

      if (!geminiResp.ok) {
        const errBody = await geminiResp.text().catch(() => '');
        if (job_id) {
          await supabase.from('editor_jobs').update({
            status: 'error',
            error_message: 'AI photo generation failed. Please try again.',
          }).eq('id', job_id);
        }
        return jsonResp({ error: 'AI photo generation failed. Please try again.', details: errBody.substring(0, 500) }, 502);
      }

      const geminiData = await geminiResp.json();
      generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    }

    if (!generatedImage || !generatedImage.startsWith('data:image')) {
      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: 'AI returned no image. Please try again.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'AI returned no image. Please try again.' }, 502);
    }

    const imageBase64 = generatedImage.split(',')[1];
    const imgBin = atob(imageBase64);
    const imgBytes = new Uint8Array(imgBin.length);
    for (let i = 0; i < imgBin.length; i++) imgBytes[i] = imgBin.charCodeAt(i);

    const { publicUrl: finalUrl, storagePath: finalStoragePath } = await uploadResultBuffer(
      supabase, venue_id, imgBytes, 'final',
    );

    const generationTimeMs = Date.now() - startTime;

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
        realism_mode: mode,
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
        realism_mode: mode,
        generation_plan: plan,
        reference_count: selectedReferences.length,
        reference_asset_ids: selectedReferences.map((r) => r.assetId),
        model: 'google/gemini-2.5-flash-image',
        generation_time_ms: generationTimeMs,
        style_sources: ctx.styleSourcesUsed,
      },
      created_by: user.id,
      compliance_status: 'approved',
    }).select('id').single();

    const skipLibrarySave = body.skip_library_save === true;
    let uploadId: string | null = null;
    let outputAssetId: string | null = null;

    if (!skipLibrarySave) {
      const { data: uploadData } = await supabase.from('uploads').insert({
        venue_id,
        storage_path: finalStoragePath,
        uploaded_by: user.id,
        status: 'ready',
        notes: `Pro Photo · ${mode} (${selectedReferences.length} refs)`,
      }).select('id').single();

      uploadId = uploadData?.id || null;

      const modeLabel = mode.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      try {
        const { data: contentAsset } = await supabase.from('content_assets').insert({
          venue_id,
          created_by: user.id,
          asset_type: 'image',
          source_type: 'generated_image',
          status: 'draft',
          title: `Pro Photo · ${modeLabel}`,
          storage_path: finalStoragePath,
          storage_bucket: 'content-library',
          pool: 'content_library',
          public_url: finalUrl,
          mime_type: 'image/jpeg',
          source_job_id: editedAssetData?.id || null,
          derived_from_editor_job_id: job_id || null,
          prompt_snapshot: {
            prompt: prompt.substring(0, 2000),
            generation_plan: plan,
          },
          generation_settings: {
            generation_mode: mode,
            generation_plan: plan,
            reference_count: selectedReferences.length,
            model: 'google/gemini-2.5-flash-image',
            generation_time_ms: generationTimeMs,
            style_sources: ctx.styleSourcesUsed,
          },
          metadata: {
            generation_mode: mode,
            edited_asset_id: editedAssetData?.id || null,
            upload_id: uploadId,
          },
        }).select('id').single();
        outputAssetId = contentAsset?.id || null;
      } catch (e) {
        console.warn('[PRO-PHOTO] content_assets insert error:', e);
      }
    }

    try {
      await supabase.from('venue_style_generation_logs').insert({
        venue_id,
        upload_id: uploadId,
        edited_asset_id: editedAssetData?.id || null,
        model_name: 'google/gemini-2.5-flash-image',
        prompt_text: prompt.substring(0, 2000),
        style_summary_used: ctx.styleSummary || null,
        reference_asset_ids: selectedReferences.map((r) => r.assetId),
        style_sources_used: ctx.styleSourcesUsed,
        dish_lock_applied: true,
        retry_count: 0,
        status: 'completed',
        duration_ms: generationTimeMs,
      });
    } catch (e) {
      console.warn('[PRO-PHOTO] generation log insert error:', e);
    }

    return jsonResp({
      success: true,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      storage_path: finalStoragePath,
      reference_count: selectedReferences.length,
      background_source: ctx.referenceImages.length > 0 ? 'brand_references' : 'ai_generated',
      style_sources: ctx.styleSourcesUsed,
      style_summary: ctx.styleSummary || null,
      model: 'google/gemini-2.5-flash-image',
      generation_time_ms: generationTimeMs,
      edited_asset_id: editedAssetData?.id || null,
      output_asset_id: outputAssetId,
      generation_mode: mode,
      generation_plan: plan,
      generation_warning: generationWarning,
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
