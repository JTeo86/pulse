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

interface EditRequest {
  sourceUrl?: string;
  sourceFileBase64?: string;
  sourceFileName?: string;
  operation: 'remove-background' | 'replace-background' | 'enhance';
  backgroundUrl?: string;
  backgroundColor?: string;
  venueId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const photoRoomApiKey = Deno.env.get('PHOTOROOM_API_KEY');

    if (!photoRoomApiKey) return jsonResp({ error: 'PhotoRoom API not configured' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResp({ error: 'Invalid token' }, 401);

    const body = await req.json() as EditRequest;
    const { sourceUrl, sourceFileBase64, sourceFileName, operation, backgroundUrl, backgroundColor, venueId } = body;

    console.log(`[PHOTOROOM-EDIT] Processing ${operation} for venue ${venueId}`);

    // Verify venue access
    const { data: membership } = await supabase
      .from('venue_members').select('role').eq('venue_id', venueId).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied to venue' }, 403);

    // Resolve source image
    let sourceImageBlob: Blob;
    let resolvedSourceUrl = sourceUrl || '';

    if (sourceFileBase64) {
      const bin = atob(sourceFileBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = (sourceFileName || 'image.jpg').split('.').pop() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      sourceImageBlob = new Blob([bytes], { type: mime });

      const uploadPath = `venues/${venueId}/uploads/${crypto.randomUUID()}.${ext}`;
      await supabase.storage.from('venue-assets').upload(uploadPath, bytes, { contentType: mime, upsert: false });
      const { data: signedUpload } = await supabase.storage.from('venue-assets').createSignedUrl(uploadPath, 86400);
      resolvedSourceUrl = signedUpload?.signedUrl || '';
    } else if (sourceUrl) {
      const resp = await fetch(sourceUrl);
      if (!resp.ok) throw new Error('Failed to fetch source image');
      sourceImageBlob = await resp.blob();
    } else {
      return jsonResp({ error: 'sourceUrl or sourceFileBase64 required' }, 400);
    }

    // ── Use PhotoRoom v2 Edit API ──
    const params = new URLSearchParams();

    // Force JPEG for replace-background and enhance to prevent transparent outputs
    const useJpeg = operation !== 'remove-background';
    if (useJpeg) {
      params.set('outputFormat', 'jpg');
    }

    if (operation === 'remove-background') {
      // Remove bg → transparent (PNG, no background params)
    } else if (operation === 'replace-background') {
      params.set('lighting.mode', 'ai.auto');
      params.set('shadow.mode', 'ai.soft');
      if (backgroundUrl) {
        params.set('background.imageUrl', backgroundUrl);
      } else if (backgroundColor) {
        params.set('background.color', backgroundColor.replace('#', ''));
      } else {
        params.set('background.color', 'FFFFFF');
      }
    } else if (operation === 'enhance') {
      params.set('lighting.mode', 'ai.auto');
      params.set('shadow.mode', 'ai.soft');
      params.set('background.color', 'FFFFFF');
    } else {
      return jsonResp({ error: 'Invalid operation' }, 400);
    }

    const formData = new FormData();
    formData.append('imageFile', sourceImageBlob, 'image.jpg');

    const photoRoomResponse = await fetch(
      `https://image-api.photoroom.com/v2/edit?${params.toString()}`,
      {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: formData,
      },
    );

    if (!photoRoomResponse.ok) {
      const errorText = await photoRoomResponse.text();
      console.error('[PHOTOROOM-EDIT] v2 error:', errorText);
      return jsonResp({ error: 'PhotoRoom processing failed', details: errorText }, 500);
    }

    const processedBuffer = await photoRoomResponse.arrayBuffer();
    const outputContentType = useJpeg ? 'image/jpeg' : 'image/png';
    const outputExt = useJpeg ? 'jpg' : 'png';

    const fileName = `${crypto.randomUUID()}.${outputExt}`;
    const storagePath = `venues/${venueId}/edited/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('venue-assets')
      .upload(storagePath, processedBuffer, { contentType: outputContentType, upsert: false });

    if (uploadError) throw new Error('Failed to save processed image');

    const { data: signedResult } = await supabase.storage.from('venue-assets').createSignedUrl(storagePath, 86400);
    const resultUrl = signedResult?.signedUrl || '';

    // Log the edit
    await supabase.from('edited_assets').insert({
      venue_id: venueId,
      source_url: resolvedSourceUrl,
      output_urls: [resultUrl],
      output_types: [outputContentType],
      engine_version: 'v1',
      settings_json: { operation, backgroundUrl, backgroundColor },
      created_by: user.id,
      compliance_status: 'approved',
    });

    console.log(`[PHOTOROOM-EDIT] Successfully processed image: ${resultUrl}`);
    return jsonResp({ success: true, resultUrl, operation, sourceUrl: resolvedSourceUrl });
  } catch (error: unknown) {
    console.error('[PHOTOROOM-EDIT] Error:', error);
    const message = error instanceof Error ? error.message : 'Processing failed';
    return jsonResp({ error: message }, 500);
  }
});