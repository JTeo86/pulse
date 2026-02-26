import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const photoRoomApiKey = Deno.env.get('PHOTOROOM_API_KEY');

    if (!photoRoomApiKey) {
      return new Response(
        JSON.stringify({ error: 'PhotoRoom API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as EditRequest;
    const { sourceUrl, sourceFileBase64, sourceFileName, operation, backgroundUrl, backgroundColor, venueId } = body;

    console.log(`Processing ${operation} for venue ${venueId}`);

    // Verify user has access to venue
    const { data: membership } = await supabase
      .from('venue_members')
      .select('role')
      .eq('venue_id', venueId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Access denied to venue' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve source image: either from base64 upload or URL
    let sourceImageBlob: Blob;
    let resolvedSourceUrl = sourceUrl || '';

    if (sourceFileBase64) {
      // Client sent the file as base64 — decode it and upload via service role
      const binaryStr = atob(sourceFileBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const ext = (sourceFileName || 'image.jpg').split('.').pop() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      sourceImageBlob = new Blob([bytes], { type: mimeType });

      // Upload to storage using service role (no RLS issues)
      const uploadPath = `venues/${venueId}/uploads/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('venue-assets')
        .upload(uploadPath, bytes, { contentType: mimeType, upsert: false });

      if (uploadErr) {
        console.error('Upload error:', uploadErr);
        throw new Error('Failed to upload source image');
      }

      const { data: { publicUrl } } = supabase.storage
        .from('venue-assets')
        .getPublicUrl(uploadPath);

      resolvedSourceUrl = publicUrl;
      console.log(`Uploaded source image: ${resolvedSourceUrl}`);
    } else if (sourceUrl) {
      const sourceImageResponse = await fetch(sourceUrl);
      if (!sourceImageResponse.ok) {
        throw new Error('Failed to fetch source image');
      }
      sourceImageBlob = await sourceImageResponse.blob();
    } else {
      return new Response(
        JSON.stringify({ error: 'sourceUrl or sourceFileBase64 required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let photoRoomResponse: Response;

    if (operation === 'remove-background') {
      const formData = new FormData();
      formData.append('image_file', sourceImageBlob, 'image.jpg');
      formData.append('format', 'png');
      formData.append('size', 'full');

      photoRoomResponse = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: formData,
      });
    } else if (operation === 'replace-background') {
      const formData = new FormData();
      formData.append('image_file', sourceImageBlob, 'image.jpg');
      formData.append('format', 'png');
      formData.append('size', 'full');

      if (backgroundUrl) {
        const bgResponse = await fetch(backgroundUrl);
        if (bgResponse.ok) {
          const bgBlob = await bgResponse.blob();
          formData.append('background_file', bgBlob, 'background.jpg');
        }
      } else if (backgroundColor) {
        formData.append('bg_color', backgroundColor);
      }

      photoRoomResponse = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: formData,
      });
    } else if (operation === 'enhance') {
      const formData = new FormData();
      formData.append('image_file', sourceImageBlob, 'image.jpg');
      formData.append('format', 'png');
      formData.append('size', 'full');
      formData.append('bg_color', '#FFFFFF');

      photoRoomResponse = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: { 'x-api-key': photoRoomApiKey },
        body: formData,
      });
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid operation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!photoRoomResponse.ok) {
      const errorText = await photoRoomResponse.text();
      console.error('PhotoRoom API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'PhotoRoom processing failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processedImageBlob = await photoRoomResponse.blob();
    const processedImageBuffer = await processedImageBlob.arrayBuffer();

    const fileName = `${crypto.randomUUID()}.png`;
    const storagePath = `venues/${venueId}/edited/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('venue-assets')
      .upload(storagePath, processedImageBuffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error('Failed to save processed image');
    }

    const { data: { publicUrl } } = supabase.storage
      .from('venue-assets')
      .getPublicUrl(storagePath);

    const resultUrl = publicUrl;

    // Log the edit
    const { error: logError } = await supabase
      .from('edited_assets')
      .insert({
        venue_id: venueId,
        source_url: resolvedSourceUrl,
        output_urls: [resultUrl],
        output_types: ['image/png'],
        engine_version: 'v1',
        settings_json: { operation, backgroundUrl, backgroundColor },
        created_by: user.id,
        compliance_status: 'approved',
      });

    if (logError) {
      console.warn('Failed to log edit:', logError);
    }

    console.log(`Successfully processed image: ${resultUrl}`);

    return new Response(
      JSON.stringify({ success: true, resultUrl, operation, sourceUrl: resolvedSourceUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error processing image:', error);
    const message = error instanceof Error ? error.message : 'Processing failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
