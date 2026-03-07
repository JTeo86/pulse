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

/** Detect image format from magic bytes */
function sniffImage(buf: ArrayBuffer | Uint8Array): { ext: string; contentType: string } {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

/** Upload result buffer to venue-assets storage */
async function uploadResultBuffer(
  supabase: any,
  venueId: string,
  buffer: ArrayBuffer | Uint8Array,
  suffix: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const { ext, contentType } = sniffImage(buffer);
  console.log(`[PRO-PHOTO] uploadResultBuffer: suffix=${suffix} detected=${ext.toUpperCase()}`);
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.${ext}`;
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType });
  const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
  return { publicUrl, storagePath: path };
}

/** Resolve source image from base64 upload or URL */
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
    // Upload original to storage
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

/** Fetch atmosphere reference images as data URLs for Gemini */
async function fetchReferenceImages(
  supabase: any,
  venueId: string,
): Promise<{ urls: string[]; assetIds: string[] }> {
  const { data: assets } = await supabase
    .from('style_reference_assets')
    .select('id, storage_path, channel, pinned')
    .eq('venue_id', venueId)
    .eq('status', 'analyzed')
    .in('channel', ['atmosphere', 'brand', 'plating'])
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(6);

  if (!assets || assets.length === 0) return { urls: [], assetIds: [] };

  const bucketMap: Record<string, string> = {
    atmosphere: 'venue_atmosphere',
    brand: 'brand_inspiration',
    plating: 'plating_style',
  };

  const urls: string[] = [];
  const assetIds: string[] = [];

  for (const asset of assets.slice(0, 3)) {
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

      // Verify reachability
      const headResp = await fetch(imageUrl, { method: 'HEAD' });
      if (!headResp.ok) {
        console.warn(`[PRO-PHOTO] Reference image not reachable: ${asset.id} (${headResp.status})`);
        continue;
      }

      urls.push(imageUrl);
      assetIds.push(asset.id);
    } catch (e) {
      console.warn(`[PRO-PHOTO] Error fetching reference ${asset.id}:`, e);
    }
  }

  return { urls, assetIds };
}

/** Build Gemini prompt with Dish Lock rules */
function buildPrompt(
  realismMode: string,
  brandPreset: string,
  brandRules: string,
  venueName: string,
  venueCity: string,
  hasReferences: boolean,
): string {
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
  const venueTone = toneMap[brandPreset] || toneMap.casual;

  const backgroundInstruction = hasReferences
    ? `Match the lighting, table surfaces, interior mood and color palette of the provided reference images.`
    : `Generate a realistic restaurant table environment matching this style: ${venueTone}.${venueCity ? ` The venue is located in ${venueCity}.` : ''}`;

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
- Do NOT make the image look artificial, illustrated, or AI-generated.

TASK:
Re-photograph the dish as if it were captured by a professional food photographer in a real restaurant setting.

ENVIRONMENT:
Place the dish naturally in a restaurant setting suitable for ${venueName ? `"${venueName}"` : 'a restaurant'} — a ${venueTone} venue.

BACKGROUND:
${backgroundInstruction}

LIGHTING:
Soft cinematic lighting, shallow depth of field, professional food photography style.

MODE: ${modeInstruction}

${brandRules ? `BRAND NOTES: ${brandRules.substring(0, 300)}` : ''}

GOAL:
Produce a natural restaurant photo that could appear on the venue's Instagram page while keeping the dish completely unchanged.

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
    const { venue_id, input_image_url, sourceFileBase64, sourceFileName, style_preset, realism_mode, job_id } = body;
    if (!venue_id) return jsonResp({ error: 'venue_id required' }, 400);

    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    // ═══ Resolve Lovable API key ═══
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('[PRO-PHOTO] Missing LOVABLE_API_KEY');
      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: 'Missing AI configuration. Contact support.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'AI service not configured.' }, 500);
    }

    // ═══ STEP 1 — Resolve source image ═══
    console.log('[PRO-PHOTO] Upload received');
    const { base64: sourceBase64, mime: sourceMime, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ═══ STEP 2 — Gather brand context ═══
    console.log('[PRO-PHOTO] Gathering brand context…');

    const [brandKitResult, venueResult] = await Promise.all([
      supabase.from('brand_kits').select('preset, rules_text').eq('venue_id', venue_id).single(),
      supabase.from('venues').select('name, city').eq('id', venue_id).single(),
    ]);

    const brandPreset = brandKitResult.data?.preset || style_preset || 'casual';
    const brandRules = brandKitResult.data?.rules_text || '';
    const venueName = venueResult.data?.name || 'restaurant';
    const venueCity = venueResult.data?.city || '';

    // ═══ STEP 3 — Fetch reference images ═══
    console.log('[PRO-PHOTO] Loading brand references…');
    const { urls: referenceUrls, assetIds: referenceAssetIds } = await fetchReferenceImages(supabase, venue_id);
    console.log(`[PRO-PHOTO] Brand references loaded: ${referenceUrls.length} images (assets: ${referenceAssetIds.join(', ') || 'none'})`);

    // ═══ STEP 4 — Build prompt & call Gemini ═══
    const prompt = buildPrompt(
      realism_mode || 'safe',
      brandPreset,
      brandRules,
      venueName,
      venueCity,
      referenceUrls.length > 0,
    );

    // Build message content: prompt + dish image + reference images
    const messageContent: any[] = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: { url: `data:${sourceMime};base64,${sourceBase64}` },
      },
    ];

    // Add reference images
    for (const refUrl of referenceUrls) {
      messageContent.push({
        type: 'image_url',
        image_url: { url: refUrl },
      });
    }

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

      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: 'AI photo generation failed. Please try again.',
        }).eq('id', job_id);
      }

      return jsonResp({
        error: 'AI photo generation failed. Please try again.',
        gemini_status: geminiStatus,
      }, 502);
    }

    const geminiData = await geminiResp.json();
    const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage || !generatedImage.startsWith('data:image')) {
      console.error('[PRO-PHOTO] Gemini returned no image data');
      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: 'AI returned no image. Please try again.',
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

    await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl],
      output_types: ['image/jpeg'],
      engine_version: 'v2',
      settings_json: {
        style_preset: brandPreset,
        realism_mode: realism_mode || 'safe',
        reference_count: referenceUrls.length,
        reference_asset_ids: referenceAssetIds,
        model: 'google/gemini-2.5-flash-image',
        generation_time_ms: generationTimeMs,
      },
      created_by: user.id,
      compliance_status: 'approved',
    });

    // Insert to uploads (content library) — non-blocking
    try {
      await supabase.from('uploads').insert({
        venue_id,
        storage_path: finalStoragePath,
        uploaded_by: user.id,
        status: 'completed',
        notes: `Pro Photo (Gemini, ${realism_mode || 'safe'}, ${referenceUrls.length} refs)`,
      });
    } catch (e) {
      console.warn('[PRO-PHOTO] uploads insert error (non-blocking):', e);
    }

    // ═══ Final diagnostic log ═══
    console.log(JSON.stringify({
      tag: 'PRO-PHOTO-RESULT',
      job_id: job_id || 'none',
      venue_id,
      model: 'google/gemini-2.5-flash-image',
      reference_images_used: referenceUrls.length,
      reference_asset_ids: referenceAssetIds,
      realism_mode: realism_mode || 'safe',
      brand_preset: brandPreset,
      generation_time_ms: generationTimeMs,
      final_url: finalUrl,
    }));

    return jsonResp({
      success: true,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      reference_count: referenceUrls.length,
      background_source: referenceUrls.length > 0 ? 'brand_references' : 'ai_generated',
      model: 'google/gemini-2.5-flash-image',
      generation_time_ms: generationTimeMs,
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
