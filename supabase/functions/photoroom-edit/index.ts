import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EditRequest {
  sourceUrl: string;
  operation: 'remove-background' | 'replace-background' | 'enhance';
  backgroundUrl?: string;
  backgroundColor?: string;
  venueId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const photoRoomApiKey = Deno.env.get('PHOTOROOM_API_KEY');

    if (!photoRoomApiKey) {
      console.error('PHOTOROOM_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'PhotoRoom API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sourceUrl, operation, backgroundUrl, backgroundColor, venueId } = await req.json() as EditRequest;

    console.log(`Processing ${operation} for venue ${venueId}`);
    console.log(`Source URL: ${sourceUrl}`);

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

    let resultUrl: string;
    let photoRoomResponse: Response;

    // Fetch the source image
    const sourceImageResponse = await fetch(sourceUrl);
    if (!sourceImageResponse.ok) {
      throw new Error('Failed to fetch source image');
    }
    const sourceImageBlob = await sourceImageResponse.blob();

    if (operation === 'remove-background') {
      // PhotoRoom Remove Background API
      const formData = new FormData();
      formData.append('image_file', sourceImageBlob, 'image.jpg');
      formData.append('format', 'png');
      formData.append('size', 'full');

      photoRoomResponse = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: {
          'x-api-key': photoRoomApiKey,
        },
        body: formData,
      });

    } else if (operation === 'replace-background') {
      // PhotoRoom Replace Background API
      const formData = new FormData();
      formData.append('image_file', sourceImageBlob, 'image.jpg');
      formData.append('format', 'png');
      formData.append('size', 'full');
      
      if (backgroundUrl) {
        // Fetch background image
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
        headers: {
          'x-api-key': photoRoomApiKey,
        },
        body: formData,
      });

    } else if (operation === 'enhance') {
      // PhotoRoom Enhancement/Cleanup API
      const formData = new FormData();
      formData.append('image_file', sourceImageBlob, 'image.jpg');
      formData.append('format', 'png');
      formData.append('size', 'full');

      // Use segment with white background as enhancement baseline
      formData.append('bg_color', '#FFFFFF');

      photoRoomResponse = await fetch('https://sdk.photoroom.com/v1/segment', {
        method: 'POST',
        headers: {
          'x-api-key': photoRoomApiKey,
        },
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

    // Get the processed image
    const processedImageBlob = await photoRoomResponse.blob();
    const processedImageBuffer = await processedImageBlob.arrayBuffer();

    // Upload to Supabase Storage
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

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('venue-assets')
      .getPublicUrl(storagePath);

    resultUrl = publicUrl;

    // Log the edit in edited_assets
    const { error: logError } = await supabase
      .from('edited_assets')
      .insert({
        venue_id: venueId,
        source_url: sourceUrl,
        output_urls: [resultUrl],
        output_types: ['image/png'],
        engine_version: 'v1',
        settings_json: {
          operation,
          backgroundUrl,
          backgroundColor,
        },
        created_by: user.id,
        compliance_status: 'approved', // PhotoRoom is commercially safe
      });

    if (logError) {
      console.warn('Failed to log edit:', logError);
    }

    console.log(`Successfully processed image: ${resultUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        resultUrl,
        operation,
      }),
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
