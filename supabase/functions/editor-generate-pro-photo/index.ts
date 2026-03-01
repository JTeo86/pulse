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
  contentType = 'image/jpeg',
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.${ext}`;
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType });
  const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
  return { publicUrl, storagePath: path };
}

/** Check if a URL is actually reachable (returns 2xx) */
async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    return resp.ok;
  } catch {
    return false;
  }
}

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

    // ══════════════════════════════════════════════════════
    // STEP 0 — Resolve source image
    // ══════════════════════════════════════════════════════
    console.log('[PRO-PHOTO] Step 0: Resolving source image…');
    const { blob: sourceBlob, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ══════════════════════════════════════════════════════
    // STEP 1 — Gather style context
    // ══════════════════════════════════════════════════════
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

    const { data: platingAssets } = await supabase
      .from('style_reference_assets')
      .select('id, storage_path, pinned, analysis:style_analysis(analysis_json)')
      .eq('venue_id', venue_id)
      .eq('channel', 'plating')
      .eq('status', 'analyzed')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3);

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

    // ══════════════════════════════════════════════════════
    // STEP 2 — Determine background strategy
    // ══════════════════════════════════════════════════════
    let backgroundImageUrl: string | null = null;
    let backgroundPrompt: string | null = null;
    let backgroundSource = 'none';

    // Helper to build AI background prompt from brand identity
    const buildBrandBackgroundPrompt = () => {
      const toneMap: Record<string, string> = {
        casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
        midrange: 'elegant mid-range restaurant with linen tablecloths, warm overhead lighting, and tasteful decor',
        premium: 'upscale fine dining restaurant with dark wood, candlelight, and luxury tableware',
        luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
        nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
        family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
      };
      const tone = toneMap[brandPreset] || toneMap.casual;
      return `Realistic photo of a ${tone}. ${venueCity ? `Located in ${venueCity}.` : ''} Shot on a DSLR camera with shallow depth of field, natural lighting, soft bokeh. The table is set for food photography. Photorealistic, no fantasy, no illustration, no text, no watermarks. ${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''}`.trim();
    };

    if (atmosphereAssets && atmosphereAssets.length > 0) {
      // FIX: Use correct bucket "venue-assets" (not "venue_atmosphere")
      // Atmosphere assets are stored in venue-assets bucket under their storage_path
      const best = atmosphereAssets[0];
      const candidateUrl = supabase.storage.from('venue-assets').getPublicUrl(best.storage_path).data.publicUrl;

      // Validate the URL is accessible before using it
      const accessible = await isUrlAccessible(candidateUrl);
      if (accessible) {
        backgroundImageUrl = candidateUrl;
        backgroundSource = 'atmosphere_ref';
        console.log(`[PRO-PHOTO] Step 2: Background mode = atmosphere_ref (asset ${best.id}, pinned: ${best.pinned})`);
      } else {
        // Try venue_atmosphere bucket as fallback
        const fallbackUrl = supabase.storage.from('venue_atmosphere').getPublicUrl(best.storage_path).data.publicUrl;
        const fallbackOk = await isUrlAccessible(fallbackUrl);
        if (fallbackOk) {
          backgroundImageUrl = fallbackUrl;
          backgroundSource = 'atmosphere_ref';
          console.log(`[PRO-PHOTO] Step 2: Background from venue_atmosphere bucket (asset ${best.id})`);
        } else {
          console.warn(`[PRO-PHOTO] Step 2: Atmosphere ref URL not accessible, falling back to AI prompt`);
          backgroundPrompt = buildBrandBackgroundPrompt();
          backgroundSource = 'ai_prompt';
        }
      }
    } else {
      backgroundPrompt = buildBrandBackgroundPrompt();
      backgroundSource = 'ai_prompt';
      console.log('[PRO-PHOTO] Step 2: Background mode = ai_prompt (no atmosphere refs)');
    }

    // ══════════════════════════════════════════════════════
    // STEP 3 — Build plating influence hints
    // ══════════════════════════════════════════════════════
    let platingHints = '';
    if (platingAssets && platingAssets.length > 0) {
      const summaries: string[] = [];
      for (const pa of platingAssets) {
        const analysis = pa.analysis?.[0]?.analysis_json;
        if (analysis) {
          const comp = analysis.composition || {};
          const mood = analysis.mood_tags || [];
          summaries.push(`${comp.framing || 'centered'} framing, ${comp.angle || 'eye-level'} angle, mood: ${(mood as string[]).slice(0, 3).join(', ')}`);
        }
      }
      if (summaries.length > 0) {
        platingHints = `Plating style: ${summaries.join('; ')}. Enhance symmetry, garnish balance, and edge cleanliness. Do not change ingredients, portion size, or cuisine type.`;
      }
      console.log(`[PRO-PHOTO] Step 3: Plating guidance from ${platingAssets.length} references`);
    } else {
      const presetPlating: Record<string, string> = {
        casual: 'Clean, approachable plating with natural garnish',
        premium: 'Refined plating with precise placement and elegant garnish',
        luxury: 'Architectural plating with meticulous detail and fine garnish',
      };
      platingHints = presetPlating[brandPreset] || presetPlating.casual;
    }

    // ══════════════════════════════════════════════════════
    // STEP 4 — PhotoRoom v2 Edit API (forces JPEG = flattened)
    // ══════════════════════════════════════════════════════
    console.log('[PRO-PHOTO] Step 4: Calling PhotoRoom v2 Edit API…');

    const params = new URLSearchParams();
    params.set('lighting.mode', 'ai.auto');
    params.set('shadow.mode', 'ai.soft');
    params.set('outputFormat', 'jpg'); // Always flatten — no transparency

    if (backgroundImageUrl) {
      params.set('background.imageUrl', backgroundImageUrl);
    } else if (backgroundPrompt) {
      params.set('background.prompt', backgroundPrompt);
    } else {
      params.set('background.color', 'F5F5F0');
    }

    const editForm = new FormData();
    editForm.append('imageFile', sourceBlob, 'image.jpg');

    const editResp = await fetch(
      `https://image-api.photoroom.com/v2/edit?${params.toString()}`,
      {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: editForm,
      },
    );

    if (!editResp.ok) {
      const errText = await editResp.text();
      console.error('[PRO-PHOTO] PhotoRoom v2 error:', editResp.status, errText);
      throw new Error(`PhotoRoom processing failed (${editResp.status})`);
    }

    const composedBuffer = await editResp.arrayBuffer();
    const { publicUrl: composedUrl, storagePath: composedStoragePath } = await uploadResultBuffer(supabase, venue_id, composedBuffer, 'composed', 'image/jpeg');
    console.log('[PRO-PHOTO] Step 4 DONE — composed_url:', composedUrl);

    // ══════════════════════════════════════════════════════
    // STEP 5 — Gemini dish-only retouch + recomposite
    // ══════════════════════════════════════════════════════
    // Strategy: Send the ORIGINAL source image to Gemini (not the composed one).
    // Gemini retouches the dish/food only. Then we run PhotoRoom AGAIN on
    // Gemini's output with the SAME background params, so the background
    // is always controlled by PhotoRoom — never by Gemini.
    // This permanently eliminates "dish on black" issues.
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let finalUrl = composedUrl;
    let finalStoragePath = composedStoragePath;
    let geminiUsed = false;

    if (lovableApiKey) {
      try {
        console.log('[PRO-PHOTO] Step 5: Gemini dish-only retouch on ORIGINAL source (not composed)…');
        console.log('[PRO-PHOTO] Gemini input = resolvedSourceUrl:', resolvedSourceUrl);

        const modeMap: Record<string, string> = {
          safe: 'Minimal lighting correction. Preserve original tone and exposure as closely as possible.',
          enhanced: 'Professional lighting refinement. Strengthen micro-contrast subtly. Add subtle depth-of-field enhancement.',
          editorial: 'Slightly stronger mood lighting with enhanced highlight control. Cinematic tone grading. Still absolutely no structural changes.',
        };
        const modeInstruction = modeMap[realism_mode] || modeMap.safe;

        const prompt = `You are a professional food photography retouch specialist.

Retouch ONLY the dish, food, and plate area in this image. The background will be replaced separately — do not spend effort on it.

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

You must preserve:
- Ingredient count
- Ingredient placement
- Plate geometry
- Food structure
- Garnish quantity and position

Allowed improvements (dish/food area only):
- Adjust lighting to look like professional DSLR food photography.
- Improve white balance.
- Improve natural shadows and highlights on the food.
- Enhance crispness and texture detail of the food.
- Clean minor plating imperfections without adding new elements.
- Subtle color grading consistent with a real restaurant shoot.
- Realistic depth-of-field enhancement.

Mode: ${modeInstruction}
Brand preset: ${brandPreset}
${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''}

If unsure whether a change alters the dish identity, do NOT make the change.
Return the full image including whatever background exists — we only use the dish pixels.

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
                { type: 'image_url', image_url: { url: resolvedSourceUrl } },
              ],
            }],
            modalities: ['image', 'text'],
          }),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (generatedImage && generatedImage.startsWith('data:image')) {
            console.log('[PRO-PHOTO] Step 5.5: Recompositing Gemini-retouched dish onto composed background via PhotoRoom…');

            // Convert Gemini base64 output to blob
            const base64Data = generatedImage.split(',')[1];
            const imgBin = atob(base64Data);
            const imgBytes = new Uint8Array(imgBin.length);
            for (let i = 0; i < imgBin.length; i++) imgBytes[i] = imgBin.charCodeAt(i);
            const geminiBlob = new Blob([imgBytes], { type: 'image/jpeg' });

            // Run PhotoRoom AGAIN on Gemini's retouched output with the SAME
            // background params (backgroundImageUrl or backgroundPrompt).
            // PhotoRoom will: remove Gemini's background → apply the venue background → flatten to JPG.
            // Result: dish has Gemini's lighting improvements, background is 100% from PhotoRoom.
            const recomposeForm = new FormData();
            recomposeForm.append('imageFile', geminiBlob, 'retouched.jpg');

            const recomposeResp = await fetch(
              `https://image-api.photoroom.com/v2/edit?${params.toString()}`,
              {
                method: 'POST',
                headers: { 'x-api-key': photoRoomApiKey },
                body: recomposeForm,
              },
            );

            if (recomposeResp.ok) {
              const recomposedBuffer = await recomposeResp.arrayBuffer();
              const { publicUrl: recomposedUrl, storagePath: recomposedPath } = await uploadResultBuffer(
                supabase, venue_id, recomposedBuffer, 'final', 'image/jpeg',
              );
              finalUrl = recomposedUrl;
              finalStoragePath = recomposedPath;
              geminiUsed = true;
              console.log('[PRO-PHOTO] Step 5.5 DONE — Recomposed (dish from Gemini + background from PhotoRoom)');
              console.log('[PRO-PHOTO] final_url:', finalUrl);
            } else {
              const errText = await recomposeResp.text();
              console.warn(`[PRO-PHOTO] Recompose PhotoRoom call failed (${recomposeResp.status}): ${errText}`);
              console.warn('[PRO-PHOTO] Falling back to composed_url as final');
            }
          } else {
            console.warn('[PRO-PHOTO] Gemini returned no image data, using composed result');
          }
        } else {
          console.warn(`[PRO-PHOTO] Gemini failed (${geminiResp.status}), using composed result`);
        }
      } catch (geminiErr) {
        console.warn('[PRO-PHOTO] Gemini error (non-fatal):', geminiErr);
      }
    } else {
      console.log('[PRO-PHOTO] Step 5: Skipped (no LOVABLE_API_KEY)');
    }

    // ══════════════════════════════════════════════════════
    // STEP 6 — Save results
    // ══════════════════════════════════════════════════════
    const finalImageVariants = {
      square_1_1: finalUrl,
      portrait_4_5: finalUrl,
      vertical_9_16: finalUrl,
    };

    // Update editor_jobs if job_id provided
    if (job_id) {
      await supabase.from('editor_jobs').update({
        status: 'done',
        final_image_url: finalUrl,
        final_image_variants: finalImageVariants,
        cutout_url: composedUrl,
        replated_url: geminiUsed ? finalUrl : null,
      }).eq('id', job_id);
    }

    // Log in edited_assets
    await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl, composedUrl].filter(Boolean),
      output_types: ['image/jpeg'],
      engine_version: 'v2',
      settings_json: {
        style_preset: brandPreset,
        realism_mode,
        background_source: backgroundSource,
        gemini_used: geminiUsed,
        atmosphere_ref_count: atmosphereAssets?.length || 0,
        plating_ref_count: platingAssets?.length || 0,
      },
      created_by: user.id,
      compliance_status: 'approved',
    });

    // ── NEW: Insert into uploads so it appears in Content Library ──
    await supabase.from('uploads').insert({
      venue_id,
      storage_path: finalStoragePath,
      uploaded_by: user.id,
      status: 'completed',
      notes: `Pro Photo output (${backgroundSource}${geminiUsed ? ' + AI replated' : ''})`,
    });

    console.log(`[PRO-PHOTO] COMPLETE — composed_url: ${composedUrl}, final_url: ${finalUrl}, gemini_used: ${geminiUsed}, background: ${backgroundSource}`);

    return jsonResp({
      success: true,
      composed_url: composedUrl,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      background_source: backgroundSource,
      gemini_used: geminiUsed,
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
