import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { venue_id, input_image_url, sourceFileBase64, sourceFileName, style_preset, realism_mode } = body;

    if (!venue_id) {
      return new Response(JSON.stringify({ error: 'venue_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is a venue member
    const { data: membership } = await supabase
      .from('venue_members')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const photoRoomApiKey = Deno.env.get('PHOTOROOM_API_KEY');
    if (!photoRoomApiKey) {
      return new Response(JSON.stringify({ error: 'PhotoRoom API not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== STEP 0: Resolve source image =====
    let sourceBlob: Blob;
    let resolvedSourceUrl = input_image_url || '';

    if (sourceFileBase64) {
      const binaryStr = atob(sourceFileBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const ext = (sourceFileName || 'image.jpg').split('.').pop() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      sourceBlob = new Blob([bytes], { type: mimeType });

      const uploadPath = `venues/${venue_id}/uploads/${crypto.randomUUID()}.${ext}`;
      await supabase.storage.from('venue-assets').upload(uploadPath, bytes, { contentType: mimeType });
      resolvedSourceUrl = supabase.storage.from('venue-assets').getPublicUrl(uploadPath).data.publicUrl;
    } else if (input_image_url) {
      const resp = await fetch(input_image_url);
      if (!resp.ok) throw new Error('Failed to fetch source image');
      sourceBlob = await resp.blob();
    } else {
      return new Response(JSON.stringify({ error: 'input_image_url or sourceFileBase64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== STEP 1: Background Removal (PhotoRoom) =====
    console.log('Step 1: Removing background...');
    const cutoutForm = new FormData();
    cutoutForm.append('image_file', sourceBlob, 'image.jpg');
    cutoutForm.append('format', 'png');
    cutoutForm.append('size', 'full');

    const cutoutResp = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': photoRoomApiKey },
      body: cutoutForm,
    });

    if (!cutoutResp.ok) {
      const err = await cutoutResp.text();
      console.error('PhotoRoom cutout error:', err);
      throw new Error('Background removal failed');
    }

    const cutoutBlob = await cutoutResp.blob();

    // Save cutout
    const cutoutPath = `venues/${venue_id}/edited/${crypto.randomUUID()}_cutout.png`;
    const cutoutBuffer = await cutoutBlob.arrayBuffer();
    await supabase.storage.from('venue-assets').upload(cutoutPath, cutoutBuffer, { contentType: 'image/png' });
    const cutoutUrl = supabase.storage.from('venue-assets').getPublicUrl(cutoutPath).data.publicUrl;
    console.log('Cutout saved:', cutoutUrl);

    // ===== STEP 2: Select background =====
    console.log('Step 2: Selecting background...');

    // Try to get atmosphere assets (pinned first, then newest)
    const { data: atmosphereAssets } = await supabase
      .from('style_reference_assets')
      .select('*, analysis:style_analysis(*)')
      .eq('venue_id', venue_id)
      .eq('channel', 'atmosphere')
      .eq('status', 'analyzed')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);

    let backgroundImageUrl: string | null = null;
    let backgroundSource = 'none';

    // Use style preset to influence background selection
    const vibePreset = style_preset || 'casual';

    if (atmosphereAssets && atmosphereAssets.length > 0) {
      // Pick best atmosphere asset - use first pinned/analyzed
      const bestAsset = atmosphereAssets[0];
      // Get public URL from venue_atmosphere bucket
      const pubUrl = supabase.storage.from('venue_atmosphere').getPublicUrl(bestAsset.storage_path).data.publicUrl;
      backgroundImageUrl = pubUrl;
      backgroundSource = 'atmosphere';
      console.log(`Using atmosphere asset: ${bestAsset.id}`);
    } else {
      // Fallback: try commercial-safe background_assets
      const { data: fallbackBgs } = await supabase
        .from('background_assets')
        .select('*')
        .eq('allow_in_production', true)
        .eq('commercial_safe_status', 'approved')
        .is('venue_id', null)
        .order('created_at', { ascending: false })
        .limit(5);

      if (fallbackBgs && fallbackBgs.length > 0) {
        // Select based on vibe
        const vibeMatch = fallbackBgs.find(bg =>
          bg.vibe_tags?.some((t: string) => t.toLowerCase().includes(vibePreset))
        );
        const chosenBg = vibeMatch || fallbackBgs[0];
        backgroundImageUrl = chosenBg.file_url;
        backgroundSource = 'platform_default';
        console.log(`Using fallback background: ${chosenBg.id}`);
      }
    }

    // ===== STEP 3: Replace background =====
    let finalBlob: Blob;
    let finalUrl: string;

    if (backgroundImageUrl) {
      console.log('Step 3: Replacing background...');
      const replaceForm = new FormData();
      replaceForm.append('image_file', cutoutBlob, 'cutout.png');
      replaceForm.append('format', 'png');
      replaceForm.append('size', 'full');

      const bgResp = await fetch(backgroundImageUrl);
      if (bgResp.ok) {
        const bgBlob = await bgResp.blob();
        replaceForm.append('background_file', bgBlob, 'background.jpg');
      }

      const replaceResp = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: replaceForm,
      });

      if (!replaceResp.ok) {
        console.warn('Background replace failed, using cutout');
        finalBlob = cutoutBlob;
      } else {
        finalBlob = await replaceResp.blob();
      }
    } else {
      // No background available — use neutral white
      console.log('Step 3: No background available, using white studio');
      const studioForm = new FormData();
      studioForm.append('image_file', cutoutBlob, 'cutout.png');
      studioForm.append('format', 'png');
      studioForm.append('size', 'full');
      studioForm.append('bg_color', '#F5F5F0');

      const studioResp = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: studioForm,
      });

      if (!studioResp.ok) {
        finalBlob = cutoutBlob;
      } else {
        finalBlob = await studioResp.blob();
      }
    }

    // Save final image
    const finalPath = `venues/${venue_id}/edited/${crypto.randomUUID()}_pro.png`;
    const finalBuffer = await finalBlob.arrayBuffer();
    await supabase.storage.from('venue-assets').upload(finalPath, finalBuffer, { contentType: 'image/png' });
    finalUrl = supabase.storage.from('venue-assets').getPublicUrl(finalPath).data.publicUrl;

    // ===== STEP 4: Gemini polish (scaffold — skip if no key) =====
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let polishedUrl = finalUrl;
    let geminiUsed = false;

    if (lovableApiKey) {
      try {
        console.log('Step 4: Attempting Gemini pro photo polish...');

        // Fetch brand rules and plating profile for prompt context
        const { data: brandKit } = await supabase
          .from('brand_kits')
          .select('rules_text, preset')
          .eq('venue_id', venue_id)
          .single();

        const { data: styleProfile } = await supabase
          .from('venue_style_profile')
          .select('plating_profile, merged_profile')
          .eq('venue_id', venue_id)
          .single();

        const platingHints = styleProfile?.plating_profile
          ? JSON.stringify(styleProfile.plating_profile).substring(0, 500)
          : 'No plating profile available';

        const brandRules = brandKit?.rules_text || 'No specific brand rules';
        const brandPreset = brandKit?.preset || vibePreset;

        const prompt = `You are a professional food photographer retouching an image.
Style preset: ${brandPreset}
Brand rules: ${brandRules}
Plating guidance: ${platingHints}

Make this food photo look like it was shot by a professional food photographer:
- Enhance lighting to be soft, diffused, and appetizing
- Boost food colors to look fresh and vibrant without looking artificial
- Add subtle depth of field if appropriate
- Ensure the composition feels balanced and professional
- Keep the image realistic — this is for commercial hospitality use
- Do NOT add text, watermarks, or logos`;

        const geminiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: finalUrl } },
                ],
              },
            ],
            modalities: ['image', 'text'],
          }),
        });

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (generatedImage && generatedImage.startsWith('data:image')) {
            // Decode base64 and upload
            const base64Data = generatedImage.split(',')[1];
            const imgBinary = atob(base64Data);
            const imgBytes = new Uint8Array(imgBinary.length);
            for (let i = 0; i < imgBinary.length; i++) {
              imgBytes[i] = imgBinary.charCodeAt(i);
            }

            const polishedPath = `venues/${venue_id}/edited/${crypto.randomUUID()}_polished.png`;
            await supabase.storage.from('venue-assets').upload(polishedPath, imgBytes, { contentType: 'image/png' });
            polishedUrl = supabase.storage.from('venue-assets').getPublicUrl(polishedPath).data.publicUrl;
            geminiUsed = true;
            console.log('Gemini polish applied successfully');
          }
        } else {
          console.warn('Gemini polish failed, using PhotoRoom result');
        }
      } catch (geminiErr) {
        console.warn('Gemini polish error (non-fatal):', geminiErr);
      }
    } else {
      console.log('Step 4: Skipping Gemini polish (no API key)');
    }

    // Update editor_jobs if job_id was provided
    if (body.job_id) {
      await supabase.from('editor_jobs').update({
        status: 'done',
        final_image_url: polishedUrl,
        final_image_variants: finalImageVariants,
        cutout_url: cutoutUrl,
      }).eq('id', body.job_id);
    }

    // Log in edited_assets
    await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [polishedUrl, cutoutUrl, finalUrl].filter(Boolean),
      output_types: ['image/png'],
      engine_version: 'v2',
      settings_json: {
        style_preset: vibePreset,
        realism_mode,
        background_source: backgroundSource,
        gemini_used: geminiUsed,
      },
      created_by: user.id,
      compliance_status: 'approved',
    });

    const finalImageVariants = {
      square_1_1: polishedUrl,
      portrait_4_5: polishedUrl,
      vertical_9_16: polishedUrl,
    };

    return new Response(JSON.stringify({
      success: true,
      cutout_url: cutoutUrl,
      final_image_url: polishedUrl,
      final_image_variants: finalImageVariants,
      background_source: backgroundSource,
      gemini_used: geminiUsed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('editor-generate-pro-photo error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
