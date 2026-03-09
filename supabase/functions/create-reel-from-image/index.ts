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
    const { source_asset_id, venue_id, reel_style, aspect_ratio, motion_preset, duration_seconds } = body;

    if (!source_asset_id || !venue_id) {
      return jsonResp({ error: 'source_asset_id and venue_id required' }, 400);
    }

    // Validate venue membership
    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    // Load source asset
    const { data: source, error: sourceErr } = await supabase
      .from('content_assets')
      .select('*')
      .eq('id', source_asset_id)
      .eq('venue_id', venue_id)
      .single();

    if (sourceErr || !source) return jsonResp({ error: 'Source asset not found' }, 404);
    if (source.asset_type !== 'image') return jsonResp({ error: 'Source must be an image asset' }, 400);

    // Check for video provider configuration
    // For now, check if a video provider API key exists in platform_api_keys
    const { data: videoKey } = await supabase
      .from('platform_api_keys')
      .select('key_name, is_configured')
      .in('key_name', ['KLING_API_KEY', 'RUNWAY_API_KEY', 'PIKA_API_KEY', 'VIDEO_PROVIDER_API_KEY'])
      .eq('is_configured', true)
      .limit(1)
      .maybeSingle();

    const providerConfigured = !!videoKey;

    // Determine lineage
    const rootAssetId = source.root_asset_id || source.id;
    const lineageDepth = (source.lineage_depth || 0) + 1;

    // Create the reel job record in content_assets regardless of provider status
    const { data: reelAsset, error: insertErr } = await supabase.from('content_assets').insert({
      venue_id,
      created_by: user.id,
      asset_type: 'video',
      source_type: 'generated_video',
      status: providerConfigured ? 'draft' : 'draft',
      title: `Reel from ${source.title || 'Pro Photo'}`,
      parent_asset_id: source_asset_id,
      root_asset_id: rootAssetId,
      lineage_depth: lineageDepth,
      generation_settings: {
        reel_style: reel_style || 'cinematic',
        aspect_ratio: aspect_ratio || '9:16',
        motion_preset: motion_preset || 'slow_zoom',
        duration_seconds: duration_seconds || 5,
        provider_configured: providerConfigured,
        provider_key: videoKey?.key_name || null,
      },
      metadata: {
        source_image_url: source.public_url,
        source_storage_path: source.storage_path,
        queued_at: new Date().toISOString(),
        provider_status: providerConfigured ? 'ready' : 'awaiting_provider',
      },
    }).select('*').single();

    if (insertErr) {
      console.error('[REEL] Insert error:', insertErr);
      return jsonResp({ error: 'Failed to create reel job' }, 500);
    }

    console.log(`[REEL] Job created: asset=${reelAsset.id}, provider_configured=${providerConfigured}`);

    if (!providerConfigured) {
      return jsonResp({
        success: true,
        asset: reelAsset,
        provider_configured: false,
        message: 'Reel job queued. Video provider not yet configured — configure in Platform Admin to process.',
      });
    }

    // TODO: When a video provider is connected, call the provider API here
    // For now, return the queued job
    return jsonResp({
      success: true,
      asset: reelAsset,
      provider_configured: true,
      message: 'Reel job queued for processing.',
    });
  } catch (err: unknown) {
    console.error('[REEL] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
