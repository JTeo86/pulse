import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { job_id, venue_id, realism_mode, style_preset } = body;

    if (!job_id || !venue_id) {
      return new Response(JSON.stringify({ error: 'job_id and venue_id required' }), {
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

    // Fetch the job
    const { data: job, error: jobError } = await supabase
      .from('editor_jobs')
      .select('*')
      .eq('id', job_id)
      .eq('venue_id', venue_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark job as processing
    await supabase
      .from('editor_jobs')
      .update({ status: 'processing' })
      .eq('id', job_id);

    // =====================================================================
    // TODO: STEP 1 — Background Removal (PhotoRoom)
    // Replace the placeholder below with:
    //   const photoRoomKey = await getSettingValue(supabase, 'PHOTOROOM_API_KEY');
    //   const cutoutUrl = await callPhotoRoomAPI(photoRoomKey, job.input_image_url);
    // =====================================================================
    const cutoutUrl = job.input_image_url; // PLACEHOLDER

    // =====================================================================
    // TODO: STEP 2 — AI Replating / Pro Photo Polish (Gemini Image Edit)
    // Replace the placeholder below with:
    //   const geminiKey = await getSettingValue(supabase, 'GEMINI_IMAGE_API_KEY');
    //   const replatedUrl = await callGeminiImageEdit(geminiKey, cutoutUrl, realism_mode, style_preset);
    // =====================================================================
    const replatedUrl = job.input_image_url; // PLACEHOLDER

    // =====================================================================
    // PLACEHOLDER: Generate export variants (1:1, 4:5, 9:16)
    // TODO: Replace with actual resize/crop logic (Cloudinary / sharp / Supabase transform)
    // For now we use the same URL for all variants
    // =====================================================================
    const finalImageVariants = {
      square_1_1: replatedUrl,
      portrait_4_5: replatedUrl,
      vertical_9_16: replatedUrl,
    };

    // Mark job as done with results
    const { error: updateError } = await supabase
      .from('editor_jobs')
      .update({
        status: 'done',
        cutout_url: cutoutUrl,
        replated_url: replatedUrl,
        final_image_url: replatedUrl,
        final_image_variants: finalImageVariants,
      })
      .eq('id', job_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({
      success: true,
      job_id,
      final_image_url: replatedUrl,
      final_image_variants: finalImageVariants,
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
