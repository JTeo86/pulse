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

async function resolveSourceImage(
  supabase: any,
  venueId: string,
  inputImageUrl?: string,
  sourceFileBase64?: string,
  sourceFileName?: string,
): Promise<{ blob: Blob; publicUrl: string }> {
  if (sourceFileBase64) {
    const bin = atob(sourceFileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = (sourceFileName || 'image.jpg').split('.').pop() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const blob = new Blob([bytes], { type: mime });
    const path = `venues/${venueId}/uploads/${crypto.randomUUID()}.${ext}`;
    await supabase.storage.from('venue-assets').upload(path, bytes, { contentType: mime });
    const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
    return { blob, publicUrl };
  }
  if (inputImageUrl) {
    const resp = await fetch(inputImageUrl);
    if (!resp.ok) throw new Error('Failed to fetch source image');
    return { blob: await resp.blob(), publicUrl: inputImageUrl };
  }
  throw new Error('input_image_url or sourceFileBase64 required');
}

async function uploadResultBuffer(
  supabase: any,
  venueId: string,
  buffer: ArrayBuffer,
  suffix: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.jpg`;
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType: 'image/jpeg' });
  const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
  return { publicUrl, storagePath: path };
}

/** Resolve a background image URL from a style_reference_asset.
 *  venue_atmosphere is now PUBLIC, so we use getPublicUrl + HEAD check.
 *  Falls back to venue-assets (also public). */
async function resolveBackgroundUrl(
  supabase: any,
  storagePath: string,
): Promise<{ url: string; bucket: string; headStatus: number } | null> {
  // venue_atmosphere is the primary bucket for atmosphere assets (now public)
  // venue-assets is a fallback (also public)
  const buckets = ['venue_atmosphere', 'venue-assets'];

  for (const bucketName of buckets) {
    const candidateUrl = supabase.storage.from(bucketName).getPublicUrl(storagePath).data.publicUrl;
    try {
      const resp = await fetch(candidateUrl, { method: 'HEAD' });
      console.log(`[PRO-PHOTO] HEAD ${bucketName}/${storagePath} → ${resp.status}`);
      if (resp.ok) {
        return { url: candidateUrl, bucket: bucketName, headStatus: resp.status };
      }
    } catch (e) {
      console.warn(`[PRO-PHOTO] HEAD failed for ${bucketName}/${storagePath}:`, e);
    }
  }
  return null;
}

/** Call PhotoRoom v2/edit with one automatic retry on 5xx */
async function callPhotoRoomWithRetry(
  form: FormData,
  params: URLSearchParams,
  apiKey: string,
): Promise<{ ok: boolean; status: number; buffer?: ArrayBuffer; errorBody?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(
      `https://image-api.photoroom.com/v2/edit?${params.toString()}`,
      { method: 'POST', headers: { 'x-api-key': apiKey }, body: form },
    );
    if (resp.ok) {
      return { ok: true, status: resp.status, buffer: await resp.arrayBuffer() };
    }
    const errText = await resp.text();
    if (resp.status >= 500 && attempt === 0) {
      console.warn(`[PRO-PHOTO] PhotoRoom 5xx (${resp.status}), retrying once…`);
      continue;
    }
    return { ok: false, status: resp.status, errorBody: errText };
  }
  return { ok: false, status: 0, errorBody: 'Exhausted retries' };
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
    const { venue_id, input_image_url, sourceFileBase64, sourceFileName, style_preset, realism_mode, job_id } = body;
    if (!venue_id) return jsonResp({ error: 'venue_id required' }, 400);

    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    const photoRoomApiKey = Deno.env.get('PHOTOROOM_API_KEY');
    if (!photoRoomApiKey) return jsonResp({ error: 'PhotoRoom API not configured' }, 500);

    // ═══ STEP 0 — Resolve source image ═══
    console.log('[PRO-PHOTO] Step 0: Resolving source image…');
    const { blob: sourceBlob, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ═══ STEP 1 — Gather style context ═══
    console.log('[PRO-PHOTO] Step 1: Gathering style context…');

    const { data: atmosphereAssets } = await supabase
      .from('style_reference_assets')
      .select('id, storage_path, pinned')
      .eq('venue_id', venue_id)
      .eq('channel', 'atmosphere')
      .eq('status', 'analyzed')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: brandKit } = await supabase
      .from('brand_kits')
      .select('preset, rules_text')
      .eq('venue_id', venue_id)
      .single();

    const { data: venue } = await supabase
      .from('venues')
      .select('name, city')
      .eq('id', venue_id)
      .single();

    const brandPreset = brandKit?.preset || style_preset || 'casual';
    const brandRules = brandKit?.rules_text || '';
    const venueName = venue?.name || 'restaurant';
    const venueCity = venue?.city || '';

    // ═══ STEP 2 — Select background ═══
    console.log(`[PRO-PHOTO] Step 2: atmosphere_refs_found_count=${atmosphereAssets?.length || 0}`);

    let backgroundImageUrl: string | null = null;
    let backgroundPrompt: string | null = null;
    type BackgroundMode = 'atmosphere_ref' | 'brand_generated' | 'studio_default';
    let backgroundMode: BackgroundMode = 'brand_generated';
    let bgMeta = { bucket: '', path: '', signed_url_used: false, ttl_seconds: 0 };

    if (atmosphereAssets && atmosphereAssets.length > 0) {
      // Shuffle top 3 to avoid repetitive visuals
      const pool = atmosphereAssets.slice(0, Math.min(3, atmosphereAssets.length));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      for (const asset of pool) {
        const result = await resolveBackgroundUrl(supabase, asset.storage_path);
        if (result) {
          backgroundImageUrl = result.url;
          backgroundMode = 'atmosphere_ref';
          bgMeta = {
            bucket: result.bucket,
            path: asset.storage_path,
            signed_url_used: result.signedUrlUsed,
            ttl_seconds: result.signedUrlUsed ? 300 : 0,
          };
          console.log(`[PRO-PHOTO] Step 2: Background = atmosphere_ref (asset ${asset.id}, bucket=${result.bucket}, signed=${result.signedUrlUsed})`);
          break;
        }
        console.warn(`[PRO-PHOTO] Step 2: Asset ${asset.id} not accessible in any bucket, trying next…`);
      }
    }

    // Fallback: brand-generated prompt
    if (!backgroundImageUrl) {
      const toneMap: Record<string, string> = {
        casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
        midrange: 'elegant mid-range restaurant with linen tablecloths, warm overhead lighting, and tasteful decor',
        premium: 'upscale fine dining restaurant with dark wood, candlelight, and luxury tableware',
        luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
        nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
        family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
      };
      const tone = toneMap[brandPreset] || toneMap.casual;
      backgroundPrompt = `Realistic photo of a ${tone}. ${venueCity ? `Located in ${venueCity}.` : ''} Shot on a DSLR camera with shallow depth of field, natural lighting, soft bokeh. The table is set for food photography. Photorealistic, no fantasy, no illustration, no text, no watermarks. ${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''}`.trim();
      backgroundMode = 'brand_generated';
      console.log(`[PRO-PHOTO] Step 2: Background = brand_generated (no valid atmosphere refs)`);
    }

    console.log(`[PRO-PHOTO] DEBUG: background_mode=${backgroundMode}, bg_bucket=${bgMeta.bucket}, signed_url=${bgMeta.signed_url_used}`);

    // ═══ STEP 3 — Build PhotoRoom params ═══
    const params = new URLSearchParams();
    params.set('lighting.mode', 'ai.auto');
    params.set('shadow.mode', 'ai.soft');
    params.set('outputFormat', 'jpg');

    if (backgroundImageUrl) {
      params.set('background.imageUrl', backgroundImageUrl);
    } else if (backgroundPrompt) {
      params.set('background.prompt', backgroundPrompt);
    } else {
      params.set('background.color', 'F5F5F0');
    }

    // ═══ STEP 4 — PhotoRoom compose (with retry) ═══
    console.log('[PRO-PHOTO] Step 4: Calling PhotoRoom v2 Edit (compose)…');

    const composeForm = new FormData();
    composeForm.append('imageFile', sourceBlob, 'image.jpg');

    const composeResult = await callPhotoRoomWithRetry(composeForm, params, photoRoomApiKey);

    if (!composeResult.ok || !composeResult.buffer) {
      console.error(`[PRO-PHOTO] PhotoRoom compose FAILED: status=${composeResult.status}, body=${composeResult.errorBody}`);

      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: `Background composition failed (PhotoRoom ${composeResult.status}). Check Style Intelligence backgrounds or try again.`,
        }).eq('id', job_id);
      }

      return jsonResp({
        error: 'Background could not be applied. Check Style Intelligence backgrounds or try again.',
        photoroom_status: composeResult.status,
        composition_success: false,
      }, 502);
    }

    const compositionSuccess = true;
    const { publicUrl: composedUrl, storagePath: composedStoragePath } = await uploadResultBuffer(
      supabase, venue_id, composeResult.buffer, 'composed',
    );
    console.log(`[PRO-PHOTO] Step 4 DONE — composed_url: ${composedUrl}, photoroom_status=${composeResult.status}`);

    // ═══ STEP 5 — Gemini retouch (only if composition succeeded) ═══
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let finalUrl = composedUrl;
    let finalStoragePath = composedStoragePath;
    let geminiUsed = false;
    let geminiOutputContentType = 'skipped';

    if (lovableApiKey && compositionSuccess) {
      try {
        console.log('[PRO-PHOTO] Step 5: Gemini retouch on composed image…');

        const modeMap: Record<string, string> = {
          safe: 'Minimal lighting correction. Preserve original tone and exposure as closely as possible.',
          enhanced: 'Professional lighting refinement. Strengthen micro-contrast subtly. Add subtle depth-of-field enhancement.',
          editorial: 'Slightly stronger mood lighting with enhanced highlight control. Cinematic tone grading. Still absolutely no structural changes.',
        };
        const modeInstruction = modeMap[realism_mode] || modeMap.safe;

        const prompt = `You are a professional food photography retouch specialist.

Your task is to improve lighting, clarity, and realism while preserving the exact physical structure of the dish AND the background environment.

This is a retouch task, NOT a redesign task. The background is a real venue environment — preserve it exactly.

Hard constraints (non-negotiable):
- Do NOT add garnish.
- Do NOT remove garnish.
- Do NOT add ingredients.
- Do NOT remove ingredients.
- Do NOT change portion size.
- Do NOT change plate shape.
- Do NOT change tableware.
- Do NOT introduce new props.
- Do NOT alter cuisine identity.
- Do NOT reposition food items.
- Do NOT add sauces or decorative elements.
- Do NOT add text, watermarks, logos, or any overlays.
- Do NOT make the image look artificial, illustrated, or AI-generated.
- Do NOT alter, darken, remove, or replace the background.
- Do NOT make the background black or transparent.
- The background must remain EXACTLY as it appears in the input.

You must preserve:
- Ingredient count
- Ingredient placement
- Plate geometry
- Food structure
- Garnish quantity and position
- Background environment (tables, lighting, venue decor)

Allowed improvements (apply to the whole image naturally):
- Adjust lighting to look like professional DSLR food photography.
- Improve white balance.
- Improve natural shadows and highlights.
- Enhance crispness and texture detail of the food.
- Clean minor plating imperfections without adding new elements.
- Subtle color grading consistent with a real restaurant shoot.
- Realistic depth-of-field enhancement.

Mode: ${modeInstruction}
Brand preset: ${brandPreset}
${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''}

Output the FULL image including the background, not just the dish.
Output as JPEG — do NOT output PNG with transparency.

If unsure whether a change alters the dish identity or background, do NOT make the change.

Maximum realism. Zero hallucination. Zero new elements.`;

        const geminiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: composedUrl } },
              ],
            }],
            modalities: ['image', 'text'],
          }),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (generatedImage && generatedImage.startsWith('data:image')) {
            const isPng = generatedImage.startsWith('data:image/png');
            geminiOutputContentType = isPng ? 'image/png' : 'image/jpeg';
            console.log(`[PRO-PHOTO] Step 5: Gemini returned image, format=${isPng ? 'PNG' : 'JPEG'}`);

            const base64Data = generatedImage.split(',')[1];
            const imgBin = atob(base64Data);
            const imgBytes = new Uint8Array(imgBin.length);
            for (let i = 0; i < imgBin.length; i++) imgBytes[i] = imgBin.charCodeAt(i);
            const geminiBlob = new Blob([imgBytes], { type: isPng ? 'image/png' : 'image/jpeg' });

            if (isPng) {
              // PNG from Gemini → recomposite via PhotoRoom to flatten with same background
              console.log('[PRO-PHOTO] Step 5.5: Gemini returned PNG — recompositing via PhotoRoom to flatten…');
              const recomposeForm = new FormData();
              recomposeForm.append('imageFile', geminiBlob, 'retouched.png');

              const recomposeResult = await callPhotoRoomWithRetry(recomposeForm, params, photoRoomApiKey);

              if (recomposeResult.ok && recomposeResult.buffer) {
                const { publicUrl: recomposedUrl, storagePath: recomposedPath } = await uploadResultBuffer(
                  supabase, venue_id, recomposeResult.buffer, 'final',
                );
                finalUrl = recomposedUrl;
                finalStoragePath = recomposedPath;
                geminiUsed = true;
                console.log(`[PRO-PHOTO] Step 5.5 DONE — Recomposed final (PNG flattened), final_url: ${finalUrl}`);
              } else {
                console.warn(`[PRO-PHOTO] Recompose failed (${recomposeResult.status}): ${recomposeResult.errorBody} — using composed_url as final`);
              }
            } else {
              // JPEG from Gemini — save directly
              const geminiBuffer = imgBytes.buffer;
              const { publicUrl: geminiUrl, storagePath: geminiPath } = await uploadResultBuffer(
                supabase, venue_id, geminiBuffer, 'final',
              );
              finalUrl = geminiUrl;
              finalStoragePath = geminiPath;
              geminiUsed = true;
              console.log(`[PRO-PHOTO] Step 5 DONE — Gemini JPEG saved as final, final_url: ${finalUrl}`);
            }
          } else {
            console.warn('[PRO-PHOTO] Gemini returned no image data, using composed_url as final');
          }
        } else {
          console.warn(`[PRO-PHOTO] Gemini failed (${geminiResp.status}), using composed_url as final`);
        }
      } catch (geminiErr) {
        console.warn('[PRO-PHOTO] Gemini error (non-fatal):', geminiErr);
      }
    } else if (!lovableApiKey) {
      console.log('[PRO-PHOTO] Step 5: Skipped (no LOVABLE_API_KEY)');
    }

    // ═══ STEP 6 — Integrity check: final must be .jpg ═══
    if (!finalUrl.endsWith('.jpg')) {
      console.error(`[PRO-PHOTO] INTEGRITY FAIL: final_url does not end in .jpg: ${finalUrl}`);
      // Force use composed (which is always .jpg)
      finalUrl = composedUrl;
      finalStoragePath = composedStoragePath;
      geminiUsed = false;
    }

    // ═══ STEP 7 — Save results ═══
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
        cutout_url: composedUrl,
        replated_url: geminiUsed ? finalUrl : null,
      }).eq('id', job_id);
    }

    await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl, composedUrl].filter(Boolean),
      output_types: ['image/jpeg'],
      engine_version: 'v2',
      settings_json: {
        style_preset: brandPreset,
        realism_mode,
        background_mode: backgroundMode,
        background_source_metadata: bgMeta,
        composition_success: compositionSuccess,
        gemini_used: geminiUsed,
        atmosphere_ref_count: atmosphereAssets?.length || 0,
      },
      created_by: user.id,
      compliance_status: 'approved',
    });

    await supabase.from('uploads').insert({
      venue_id,
      storage_path: finalStoragePath,
      uploaded_by: user.id,
      status: 'completed',
      notes: `Pro Photo output (${backgroundMode}${geminiUsed ? ' + AI retouched' : ''})`,
    });

    // ═══ Final diagnostic log ═══
    console.log(`[PRO-PHOTO] ═══ RUN COMPLETE ═══`);
    console.log(`[PRO-PHOTO]   background_mode_selected: ${backgroundMode}`);
    console.log(`[PRO-PHOTO]   atmosphere_refs_found_count: ${atmosphereAssets?.length || 0}`);
    console.log(`[PRO-PHOTO]   selected_background_bucket: ${bgMeta.bucket || 'N/A'}`);
    console.log(`[PRO-PHOTO]   selected_background_path: ${bgMeta.path || 'N/A'}`);
    console.log(`[PRO-PHOTO]   signed_url_generated: ${bgMeta.signed_url_used}`);
    console.log(`[PRO-PHOTO]   signed_url_ttl_seconds: ${bgMeta.ttl_seconds}`);
    console.log(`[PRO-PHOTO]   photoroom_compose_status: ${composeResult.status}`);
    console.log(`[PRO-PHOTO]   composed_url: ${composedUrl} (content-type: image/jpeg)`);
    console.log(`[PRO-PHOTO]   gemini_output_content_type: ${geminiOutputContentType}`);
    console.log(`[PRO-PHOTO]   gemini_used: ${geminiUsed}`);
    console.log(`[PRO-PHOTO]   final_url: ${finalUrl} (content-type: image/jpeg)`);

    return jsonResp({
      success: true,
      composed_url: composedUrl,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      background_mode: backgroundMode,
      background_source_metadata: bgMeta,
      composition_success: compositionSuccess,
      gemini_used: geminiUsed,
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
