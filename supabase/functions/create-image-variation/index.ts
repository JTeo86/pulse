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

    // Validate venue membership
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

    // Determine realism mode
    const parentSettings = (parent.generation_settings || {}) as Record<string, unknown>;
    const realismMode = realism_mode_override || (parentSettings.realism_mode as string) || 'safe';

    // Determine lineage
    const rootAssetId = parent.root_asset_id || parent.id;
    const lineageDepth = (parent.lineage_depth || 0) + 1;

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
    const variationPrompt = `You are creating a variation of an existing food photograph for restaurant marketing.

STRICT RULES:
- Keep the same dish, plating, and ingredients — the food must be recognizable as the same dish.
- Create a subtle visual variation: slightly different angle impression, lighting mood, or background atmosphere.
- Mode: ${variation_mode || 'subtle'} variation.
- Realism level: ${realismMode}.
- The result must look like a professional restaurant photograph.
- Do NOT add text, watermarks, or overlays.
- Output as JPEG.
${notes ? `\nAdditional notes: ${notes}` : ''}`;

    // Build message content
    const messageContent: unknown[] = [
      { type: 'text', text: variationPrompt },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
    ];

    console.log(`[VARIATION] Starting variation for parent=${parent_asset_id}, venue=${venue_id}`);

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

      // Create failed asset record
      await supabase.from('content_assets').insert({
        venue_id,
        created_by: user.id,
        asset_type: 'image',
        source_type: 'variation',
        status: 'failed',
        title: `Variation of ${parent.title || 'Pro Photo'}`,
        parent_asset_id,
        root_asset_id: rootAssetId,
        lineage_depth: lineageDepth,
        prompt_snapshot: { prompt: variationPrompt },
        generation_settings: { realism_mode: realismMode, variation_mode: variation_mode || 'subtle' },
        metadata: { error: 'AI generation failed', notes },
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

    // Create content_assets record
    const { data: newAsset, error: insertErr } = await supabase.from('content_assets').insert({
      venue_id,
      created_by: user.id,
      asset_type: 'image',
      source_type: 'variation',
      status: 'draft',
      title: `Variation of ${parent.title || 'Pro Photo'}`,
      parent_asset_id,
      root_asset_id: rootAssetId,
      lineage_depth: lineageDepth,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: contentType,
      prompt_snapshot: { prompt: variationPrompt },
      generation_settings: {
        realism_mode: realismMode,
        variation_mode: variation_mode || 'subtle',
        model: 'google/gemini-2.5-flash-image',
        generation_time_ms: generationTimeMs,
        parent_settings: parentSettings,
      },
      metadata: { notes: notes || null },
    }).select('*').single();

    if (insertErr) {
      console.error('[VARIATION] Insert error:', insertErr);
      return jsonResp({ error: 'Failed to save variation' }, 500);
    }

    console.log(`[VARIATION] Success: new asset=${newAsset.id}, time=${generationTimeMs}ms`);

    return jsonResp({
      success: true,
      asset: newAsset,
      generation_time_ms: generationTimeMs,
    });
  } catch (err: unknown) {
    console.error('[VARIATION] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
