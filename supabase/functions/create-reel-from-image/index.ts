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

// ── Provider Abstraction ─────────────────────────────────────────────
interface VideoProviderConfig {
  providerKey: string;
  apiKey: string;
  apiSecret?: string;
  isConfigured: boolean;
}

async function getActiveVideoProvider(
  supabase: ReturnType<typeof createClient>,
): Promise<VideoProviderConfig | null> {
  const { data: keys } = await supabase
    .from('platform_api_keys')
    .select('key_name, key_value, is_configured')
    .in('key_name', ['KLING_API_KEY', 'KLING_API_SECRET'])
    .eq('is_configured', true);

  const klingKey = keys?.find((k: { key_name: string }) => k.key_name === 'KLING_API_KEY');
  if (!klingKey) return null;

  const klingSecret = keys?.find((k: { key_name: string }) => k.key_name === 'KLING_API_SECRET');

  return {
    providerKey: 'kling',
    apiKey: (klingKey.key_value as string).trim(),
    apiSecret: klingSecret ? (klingSecret.key_value as string).trim() : undefined,
    isConfigured: true,
  };
}

async function checkFeatureFlags(
  supabase: ReturnType<typeof createClient>,
): Promise<{ videoEnabled: boolean; reelCreatorEnabled: boolean; klingProviderEnabled: boolean }> {
  const { data: flags } = await supabase
    .from('feature_flags')
    .select('flag_key, is_enabled')
    .is('venue_id', null)
    .in('flag_key', [
      'feature.video_enabled',
      'feature.reel_creator_enabled',
      'feature.kling_provider_enabled',
    ]);

  const get = (key: string) => flags?.find((f: { flag_key: string }) => f.flag_key === key)?.is_enabled ?? false;

  return {
    videoEnabled: get('feature.video_enabled'),
    reelCreatorEnabled: get('feature.reel_creator_enabled'),
    klingProviderEnabled: get('feature.kling_provider_enabled'),
  };
}

// ── Main Handler ─────────────────────────────────────────────────────
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
    const {
      source_asset_id,
      venue_id,
      reel_style,
      aspect_ratio,
      motion_preset,
      duration_seconds,
      style_notes,
      hook_text,
    } = body;

    if (!source_asset_id || !venue_id) {
      return jsonResp({ error: 'source_asset_id and venue_id required' }, 400);
    }

    // ── Feature flag validation ──────────────────────────────────────
    const flags = await checkFeatureFlags(supabase);
    if (!flags.videoEnabled || !flags.reelCreatorEnabled) {
      return jsonResp({
        error: 'Reel creation is not enabled',
        status: 'feature_disabled',
        message: 'Video features are currently disabled. An admin can enable them in Platform Admin.',
      }, 403);
    }

    // ── Venue membership check ───────────────────────────────────────
    const { data: membership } = await supabase
      .from('venue_members')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    // ── Load source asset ────────────────────────────────────────────
    const { data: source, error: sourceErr } = await supabase
      .from('content_assets')
      .select('*')
      .eq('id', source_asset_id)
      .eq('venue_id', venue_id)
      .single();

    if (sourceErr || !source) return jsonResp({ error: 'Source asset not found' }, 404);
    if (source.asset_type !== 'image') return jsonResp({ error: 'Source must be an image asset' }, 400);

    // ── Provider configuration check ─────────────────────────────────
    const provider = flags.klingProviderEnabled ? await getActiveVideoProvider(supabase) : null;
    const providerConfigured = !!provider;

    // ── Lineage ──────────────────────────────────────────────────────
    const rootAssetId = source.root_asset_id || source.id;
    const lineageDepth = (source.lineage_depth || 0) + 1;

    const generationSettings = {
      reel_style: reel_style || 'cinematic',
      aspect_ratio: aspect_ratio || '9:16',
      motion_preset: motion_preset || 'slow_zoom',
      duration_seconds: duration_seconds || 5,
      style_notes: style_notes || null,
      hook_text: hook_text || null,
      provider_configured: providerConfigured,
      provider_key: provider?.providerKey || null,
    };

    // ── Create editor job ────────────────────────────────────────────
    const { data: job, error: jobErr } = await supabase
      .from('editor_jobs')
      .insert({
        venue_id,
        created_by: user.id,
        mode: 'reel_creator',
        status: providerConfigured ? 'queued' : 'queued',
        style_preset: reel_style || 'cinematic',
        hook_text: hook_text || null,
        source_asset_id: source_asset_id,
        provider: provider?.providerKey || null,
        provider_settings: generationSettings,
      })
      .select('id')
      .single();

    if (jobErr) {
      console.error('[REEL] Job insert error:', jobErr);
      return jsonResp({ error: 'Failed to create reel job' }, 500);
    }

    // ── Create content asset ─────────────────────────────────────────
    const { data: reelAsset, error: insertErr } = await supabase
      .from('content_assets')
      .insert({
        venue_id,
        created_by: user.id,
        asset_type: 'video',
        source_type: 'generated_video',
        status: providerConfigured ? 'draft' : 'draft',
        title: `Reel from ${source.title || 'Pro Photo'}`,
        parent_asset_id: source_asset_id,
        root_asset_id: rootAssetId,
        derived_from_editor_job_id: job.id,
        lineage_depth: lineageDepth,
        generation_settings: generationSettings,
        metadata: {
          source_image_url: source.public_url,
          source_storage_path: source.storage_path,
          queued_at: new Date().toISOString(),
          provider_status: providerConfigured ? 'ready' : 'awaiting_provider',
          editor_job_id: job.id,
        },
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[REEL] Asset insert error:', insertErr);
      return jsonResp({ error: 'Failed to create reel asset' }, 500);
    }

    // Link output asset to job
    await supabase
      .from('editor_jobs')
      .update({ output_asset_id: reelAsset.id })
      .eq('id', job.id);

    console.log(`[REEL] Created: job=${job.id}, asset=${reelAsset.id}, provider=${providerConfigured}`);

    if (!providerConfigured) {
      return jsonResp({
        success: true,
        asset: reelAsset,
        job_id: job.id,
        provider_configured: false,
        status: 'provider_not_configured',
        message: 'Reel job queued. Video provider not yet configured — configure Kling in Platform Admin to process.',
      });
    }

    // ── TODO: Call Kling API when connected ──────────────────────────
    // When Kling provider is configured:
    // 1. Construct API request with source image + settings
    // 2. Send to Kling API endpoint
    // 3. Store provider_job_id on editor_jobs
    // 4. Set status to 'processing'
    // 5. Poll or await webhook for completion
    // For now, return queued state
    return jsonResp({
      success: true,
      asset: reelAsset,
      job_id: job.id,
      provider_configured: true,
      status: 'queued',
      message: 'Reel job queued for processing.',
    });
  } catch (err: unknown) {
    console.error('[REEL] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
