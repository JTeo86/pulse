import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Helpers ──────────────────────────────────────────────

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

async function uploadResultBlob(
  supabase: any,
  venueId: string,
  blob: Blob,
  suffix: string,
): Promise<string> {
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.png`;
  const buffer = await blob.arrayBuffer();
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType: 'image/png' });
  return supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
}

// ─── Main Handler ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ──
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

    // ── Venue membership ──
    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    const photoRoomApiKey = Deno.env.get('PHOTOROOM_API_KEY');
    if (!photoRoomApiKey) return jsonResp({ error: 'PhotoRoom API not configured' }, 500);

    // ══════════════════════════════════════════════════════
    // STEP 0 — Resolve source image
    // ══════════════════════════════════════════════════════
    console.log('Step 0: Resolving source image…');
    const { blob: sourceBlob, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ══════════════════════════════════════════════════════
    // STEP 1 — Gather style context (atmosphere + plating + brand)
    // ══════════════════════════════════════════════════════
    console.log('Step 1: Gathering style context…');

    // Atmosphere references
    const { data: atmosphereAssets } = await supabase
      .from('style_reference_assets')
      .select('id, storage_path, pinned')
      .eq('venue_id', venue_id)
      .eq('channel', 'atmosphere')
      .eq('status', 'analyzed')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);

    // Plating references
    const { data: platingAssets } = await supabase
      .from('style_reference_assets')
      .select('id, storage_path, pinned, analysis:style_analysis(analysis_json)')
      .eq('venue_id', venue_id)
      .eq('channel', 'plating')
      .eq('status', 'analyzed')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3);

    // Brand kit
    const { data: brandKit } = await supabase
      .from('brand_kits')
      .select('preset, rules_text')
      .eq('venue_id', venue_id)
      .single();

    // Venue info
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
    console.log('Step 2: Determining background strategy…');

    let backgroundImageUrl: string | null = null;
    let backgroundPrompt: string | null = null;
    let backgroundSource = 'none';

    if (atmosphereAssets && atmosphereAssets.length > 0) {
      // Use best atmosphere reference as background image
      const best = atmosphereAssets[0];
      backgroundImageUrl = supabase.storage.from('venue_atmosphere').getPublicUrl(best.storage_path).data.publicUrl;
      backgroundSource = 'atmosphere';
      console.log(`Using atmosphere asset ${best.id} (pinned: ${best.pinned})`);
    } else {
      // Generate AI background prompt from brand identity
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
      backgroundSource = 'ai_generated';
      console.log('Using AI-generated background prompt');
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
      console.log(`Plating guidance from ${platingAssets.length} references`);
    } else {
      // Derive from preset
      const presetPlating: Record<string, string> = {
        casual: 'Clean, approachable plating with natural garnish',
        premium: 'Refined plating with precise placement and elegant garnish',
        luxury: 'Architectural plating with meticulous detail and fine garnish',
      };
      platingHints = presetPlating[brandPreset] || presetPlating.casual;
    }

    // ══════════════════════════════════════════════════════
    // STEP 4 — PhotoRoom v2 Edit API (background + lighting + shadow)
    // ══════════════════════════════════════════════════════
    console.log('Step 4: Calling PhotoRoom v2 Edit API…');

    const params = new URLSearchParams();
    params.set('lighting.mode', 'ai.auto');
    params.set('shadow.mode', 'ai.soft');

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
      console.error('PhotoRoom v2 error:', editResp.status, errText);
      throw new Error(`PhotoRoom processing failed (${editResp.status})`);
    }

    const composedBlob = await editResp.blob();
    const composedUrl = await uploadResultBlob(supabase, venue_id, composedBlob, 'composed');
    console.log('Composed image saved:', composedUrl);

    // ══════════════════════════════════════════════════════
    // STEP 5 — Gemini / NanoBanana replating (optional)
    // ══════════════════════════════════════════════════════
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let finalUrl = composedUrl;
    let geminiUsed = false;

    if (lovableApiKey) {
      try {
        console.log('Step 5: Gemini replating…');

        const prompt = `You are a professional food photographer doing final retouching.
Brand preset: ${brandPreset}
${brandRules ? `Brand rules: ${brandRules.substring(0, 300)}` : ''}
${platingHints}

STRICT RULES:
- This is the SAME dish — do NOT change ingredients, cuisine, or portion size
- Only subtle improvements: symmetry, garnish balance, edge cleanliness, sauce control
- Enhance lighting to be soft, diffused, and appetizing
- Boost food colors to look fresh and vibrant without looking artificial
- Ensure realistic shadows and depth of field
- The result must look like a real DSLR photo taken by a professional food photographer
- Do NOT add text, watermarks, logos, or any overlays
- Do NOT make the image look artificial, illustrated, or AI-generated
- Keep the background exactly as-is`;

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
            const base64Data = generatedImage.split(',')[1];
            const imgBin = atob(base64Data);
            const imgBytes = new Uint8Array(imgBin.length);
            for (let i = 0; i < imgBin.length; i++) imgBytes[i] = imgBin.charCodeAt(i);

            const polishedPath = `venues/${venue_id}/edited/${crypto.randomUUID()}_replated.png`;
            await supabase.storage.from('venue-assets').upload(polishedPath, imgBytes, { contentType: 'image/png' });
            finalUrl = supabase.storage.from('venue-assets').getPublicUrl(polishedPath).data.publicUrl;
            geminiUsed = true;
            console.log('Gemini replating applied');
          }
        } else {
          const status = geminiResp.status;
          if (status === 429) console.warn('Gemini rate limited, using composed result');
          else if (status === 402) console.warn('Gemini credits exhausted, using composed result');
          else console.warn(`Gemini failed (${status}), using composed result`);
        }
      } catch (geminiErr) {
        console.warn('Gemini replating error (non-fatal):', geminiErr);
      }
    } else {
      console.log('Step 5: Skipped (no API key)');
    }

    // ══════════════════════════════════════════════════════
    // STEP 6 — Save results
    // ══════════════════════════════════════════════════════
    const finalImageVariants = {
      square_1_1: finalUrl,
      portrait_4_5: finalUrl,
      vertical_9_16: finalUrl,
    };

    // Update editor_jobs
    if (job_id) {
      await supabase.from('editor_jobs').update({
        status: 'done',
        final_image_url: finalUrl,
        final_image_variants: finalImageVariants,
        cutout_url: composedUrl,
      }).eq('id', job_id);
    }

    // Log in edited_assets
    await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl, composedUrl].filter(Boolean),
      output_types: ['image/png'],
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

    return jsonResp({
      success: true,
      composed_url: composedUrl,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      background_source: backgroundSource,
      gemini_used: geminiUsed,
    });
  } catch (err: unknown) {
    console.error('editor-generate-pro-photo error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
