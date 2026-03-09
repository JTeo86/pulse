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
  console.log(`[PRO-PHOTO] uploadResultBuffer: suffix=${suffix} detected=${ext.toUpperCase()}`);
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.${ext}`;
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType });
  const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
  return { publicUrl, storagePath: path };
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
    const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
    return { base64: sourceFileBase64, mime, publicUrl };
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

  // Load venue basics + brand kit + style profile in parallel
  const [venueResult, brandKitResult, styleProfileResult, refAssetsResult, legacyRefResult] = await Promise.all([
    supabase.from('venues').select('name, city').eq('id', venueId).single(),
    supabase.from('brand_kits').select('preset, rules_text').eq('venue_id', venueId).single(),
    supabase.from('venue_style_profiles').select('*').eq('venue_id', venueId).maybeSingle(),
    // New style reference assets
    supabase.from('venue_style_reference_assets')
      .select('id, storage_path, public_url, channel, pinned, source_type')
      .eq('venue_id', venueId)
      .eq('approved', true)
      .eq('status', 'active')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6),
    // Legacy style_reference_assets (backward compat)
    supabase.from('style_reference_assets')
      .select('id, storage_path, channel, pinned')
      .eq('venue_id', venueId)
      .eq('status', 'analyzed')
      .in('channel', ['atmosphere', 'brand', 'plating'])
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6),
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

  // Resolve reference images — prefer new table, fall back to legacy
  const referenceImages: { url: string; channel: string; assetId: string }[] = [];

  // Try new venue_style_reference_assets first
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
      // Try storage URL
      const pubUrl = supabase.storage.from('venue-assets').getPublicUrl(asset.storage_path).data.publicUrl;
      referenceImages.push({ url: pubUrl, channel: asset.channel, assetId: asset.id });
    }
  }

  // Fall back to legacy style_reference_assets if needed
  if (referenceImages.length === 0) {
    const legacyAssets = legacyRefResult.data || [];
    if (legacyAssets.length > 0) {
      styleSourcesUsed.push('style_reference_assets');
      const bucketMap: Record<string, string> = {
        atmosphere: 'venue_atmosphere',
        brand: 'brand_inspiration',
        plating: 'plating_style',
      };
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

  if (referenceImages.length > 0) {
    styleSourcesUsed.push('reference_images');
  }

  return {
    brandSummary,
    styleSummary,
    lightingMood,
    luxuryLevel,
    cuisineType,
    venueTone: brandPreset,
    negativeRules,
    dishLockRules,
    referenceImages,
    styleSourcesUsed,
    venueName,
    venueCity,
  };
}

// ── Prompt Construction ──────────────────────────────────────────────

function buildPrompt(ctx: VenueStyleContext, realismMode: string): string {
  const modeMap: Record<string, string> = {
    safe: 'Minimal changes. Only improve lighting and white balance. Keep the scene as close to original as possible.',
    enhanced: 'Professional lighting refinement. Subtle depth-of-field. Natural restaurant ambiance. Moderate improvements.',
    editorial: 'Cinematic food photography lighting. Strong depth-of-field. Dramatic but realistic restaurant setting. Maximum polish.',
  };
  const modeInstruction = modeMap[realismMode] || modeMap.safe;

  const toneMap: Record<string, string> = {
    casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
    premium: 'upscale fine dining restaurant with dark wood, candlelight, and luxury tableware',
    luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
    nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
    family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
  };
  const venueTone = toneMap[ctx.venueTone] || toneMap.casual;

  const hasRefs = ctx.referenceImages.length > 0;
  const backgroundInstruction = hasRefs
    ? `Match the lighting, table surfaces, interior mood and color palette of the provided reference images.`
    : `Generate a realistic restaurant table environment matching this style: ${venueTone}.${ctx.venueCity ? ` The venue is located in ${ctx.venueCity}.` : ''}`;

  // Build dish lock section
  const dishLockExtra = ctx.dishLockRules.length > 0
    ? '\n' + ctx.dishLockRules.map(r => `- ${r}`).join('\n')
    : '';

  // Build negative rules
  const negativeSection = ctx.negativeRules.length > 0
    ? `\n\nNEGATIVE RULES (DO NOT):\n${ctx.negativeRules.map(r => `- ${r}`).join('\n')}`
    : '';

  // Build style context section
  let styleSection = '';
  if (ctx.styleSummary || ctx.lightingMood || ctx.cuisineType || ctx.luxuryLevel) {
    const parts: string[] = [];
    if (ctx.cuisineType) parts.push(`Cuisine: ${ctx.cuisineType}`);
    if (ctx.luxuryLevel) parts.push(`Level: ${ctx.luxuryLevel}`);
    if (ctx.lightingMood) parts.push(`Lighting mood: ${ctx.lightingMood}`);
    if (ctx.styleSummary) parts.push(`Style: ${ctx.styleSummary}`);
    styleSection = `\n\nVENUE IDENTITY:\n${parts.join('\n')}`;
  }

  return `You are editing a food photograph for a restaurant marketing image.

STRICT DISH LOCK RULES:
- The food in the uploaded image must remain visually identical.
- Preserve the exact dish, ingredients, plating and portion size.
- Do NOT add garnish that was not present.
- Do NOT remove ingredients.
- Do NOT alter the crockery or plate.
- Do NOT change the shape or arrangement of the dish.
- Treat the food area as locked pixels. Only the surrounding environment may be modified.
- Do NOT add text, watermarks, logos, or any overlays.
- Do NOT make the image look artificial, illustrated, or AI-generated.${dishLockExtra}

VENUE STYLE RULES:
- Use only the provided reference images and brand data for this venue.
- Match the atmosphere, lighting, textures, surfaces and mood of this venue.
- The final image should look like it was genuinely photographed inside this specific venue or in a setting perfectly consistent with its identity.
- Do not use generic styling if venue-specific references are available.${styleSection}${negativeSection}

TASK:
Re-photograph the dish as if it were captured by a professional food photographer in a real restaurant setting.

ENVIRONMENT:
Place the dish naturally in a restaurant setting suitable for ${ctx.venueName ? `"${ctx.venueName}"` : 'a restaurant'} — a ${venueTone} venue.

BACKGROUND:
${backgroundInstruction}

LIGHTING:
Soft cinematic lighting, shallow depth of field, premium professional food photography.

MODE: ${modeInstruction}

${ctx.brandSummary ? `BRAND NOTES: ${ctx.brandSummary.substring(0, 400)}` : ''}

GOAL:
Produce a natural restaurant marketing photo suitable for this venue's Instagram or social media while keeping the dish completely unchanged.

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
    console.log('[PRO-PHOTO] Upload received');
    const { base64: sourceBase64, mime: sourceMime, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ═══ STEP 2 — Build venue style context ═══
    console.log('[PRO-PHOTO] Venue style context loading…');
    const ctx = await buildVenueStyleContext(supabase, venue_id);
    console.log(`[PRO-PHOTO] Venue style context loaded: sources=[${ctx.styleSourcesUsed.join(', ')}] refs=${ctx.referenceImages.length}`);

    // ═══ STEP 3 — Build prompt with Dish Lock ═══
    console.log('[PRO-PHOTO] Dish lock prompt built');
    const prompt = buildPrompt(ctx, realism_mode || 'safe');

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
    console.log(`[PRO-PHOTO] Gemini response received: status=${geminiStatus}`);

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text().catch(() => '');
      console.error(`[PRO-PHOTO] Gemini failed: ${geminiStatus} — ${errBody.substring(0, 500)}`);

      // Log generation failure
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
    console.log(`[PRO-PHOTO] Image stored successfully: ${finalUrl}`);

    const generationTimeMs = Date.now() - startTime;

    // ═══ STEP 6 — Save to database ═══
    const finalImageVariants = {
      square_1_1: finalUrl,
      portrait_4_5: finalUrl,
      vertical_9_16: finalUrl,
    };

    if (job_id) {
      await supabase.from('editor_jobs').update({
        status: 'done',
        final_image_url: finalUrl,
        final_image_variants: finalImageVariants,
        input_image_url: resolvedSourceUrl,
      }).eq('id', job_id);
    }

    // edited_assets record
    const { data: editedAssetData } = await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl],
      output_types: ['image/jpeg'],
      engine_version: 'v2',
      settings_json: {
        realism_mode: realism_mode || 'safe',
        reference_count: ctx.referenceImages.length,
        reference_asset_ids: ctx.referenceImages.map(r => r.assetId),
        model: 'google/gemini-2.5-flash-image',
        generation_time_ms: generationTimeMs,
        style_sources: ctx.styleSourcesUsed,
      },
      created_by: user.id,
      compliance_status: 'approved',
    }).select('id').single();

    // Content library record
    let uploadId: string | null = null;
    try {
      const { data: uploadData } = await supabase.from('uploads').insert({
        venue_id,
        storage_path: finalStoragePath,
        uploaded_by: user.id,
        status: 'completed',
        notes: `Pro Photo (Gemini, ${realism_mode || 'safe'}, ${ctx.referenceImages.length} refs)`,
      }).select('id').single();
      uploadId = uploadData?.id || null;
    } catch (e) {
      console.warn('[PRO-PHOTO] uploads insert error (non-blocking):', e);
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

    // Diagnostic log
    console.log(JSON.stringify({
      tag: 'PRO-PHOTO-RESULT',
      job_id: job_id || 'none',
      venue_id,
      model: 'google/gemini-2.5-flash-image',
      reference_images_used: ctx.referenceImages.length,
      style_sources: ctx.styleSourcesUsed,
      realism_mode: realism_mode || 'safe',
      generation_time_ms: generationTimeMs,
      final_url: finalUrl,
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
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
