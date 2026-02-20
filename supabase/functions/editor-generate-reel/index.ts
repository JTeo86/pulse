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
    const { job_id, venue_id, hook_text, cinematic_mode } = body;

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

    if (jobError || !job || !job.final_image_url) {
      return new Response(JSON.stringify({ error: 'Job not found or Pro Photo not generated yet' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a reel job entry
    await supabase
      .from('editor_jobs')
      .update({ status: 'processing', mode: 'reel', hook_text: hook_text || null })
      .eq('id', job_id);

    // =====================================================================
    // TODO: REEL RENDERING STEP
    // Check REEL_RENDERER_PROVIDER setting:
    //   - 'placeholder': use current stub (copy final image as video placeholder)
    //   - 'shotstack': call Shotstack API with Ken Burns template
    //   - 'cloudinary': call Cloudinary video API
    //   - 'ffmpeg': send to self-hosted FFmpeg worker
    //
    // TODO: CINEMATIC AI REEL (optional, disabled by default)
    //   if (cinematic_mode) {
    //     const klingKey = await getSettingValue(supabase, 'KLING_API_KEY');
    //     finalVideoUrl = await callKlingAPI(klingKey, job.final_image_url, hook_text);
    //   }
    // =====================================================================

    // PLACEHOLDER: set final_video_url to null (no video generated yet)
    // In production this would be a URL to a .mp4 file in editor/videos/
    const finalVideoUrl = null; // PLACEHOLDER — real video rendering wired here later

    // Mark job done with reel output
    await supabase
      .from('editor_jobs')
      .update({
        status: 'done',
        mode: 'reel',
        final_video_url: finalVideoUrl,
        hook_text: hook_text || null,
      })
      .eq('id', job_id);

    return new Response(JSON.stringify({
      success: true,
      job_id,
      final_video_url: finalVideoUrl,
      message: 'Reel job queued. Placeholder renderer active — wire real provider in REEL_RENDERER_PROVIDER setting.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('editor-generate-reel error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
