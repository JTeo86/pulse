import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function getAppUrl(req: Request): string {
  const envAppUrl = Deno.env.get('APP_URL');
  if (envAppUrl) return envAppUrl;
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch (_e) { /* fall through */ }
  }
  return 'https://pulseai-app.lovable.app';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { venueId: string; email: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { venueId, email } = body;
  if (!venueId || !email) {
    return new Response(JSON.stringify({ error: 'venueId and email are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify caller is owner or manager of this venue
  const { data: venue } = await callerClient
    .from('venues')
    .select('owner_user_id')
    .eq('id', venueId)
    .maybeSingle();

  const isOwner = venue?.owner_user_id === callerUser.id;

  const { data: membership } = await callerClient
    .from('venue_members')
    .select('id, role')
    .eq('venue_id', venueId)
    .eq('user_id', callerUser.id)
    .maybeSingle();

  const isManager = membership?.role === 'manager';

  if (!isOwner && !isManager) {
    return new Response(JSON.stringify({ error: 'Forbidden: you must be the venue owner or a manager' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Confirm a pending invite exists
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pendingInvite, error: inviteErr } = await adminClient
    .from('venue_invites')
    .select('id, send_count, accepted_at')
    .eq('venue_id', venueId)
    .eq('email', normalizedEmail)
    .is('accepted_at', null)
    .maybeSingle();

  if (inviteErr || !pendingInvite) {
    return new Response(JSON.stringify({ error: 'No pending invite found for this email' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch venue name for the redirect URL
  const { data: venueData } = await adminClient
    .from('venues')
    .select('name')
    .eq('id', venueId)
    .maybeSingle();

  const appUrl =
    Deno.env.get('APP_URL') ||
    req.headers.get('origin') ||
    req.headers.get('referer')?.replace(/\/$/, '') ||
    'https://pulseai-app.lovable.app';

  const venueName = venueData?.name ? encodeURIComponent(venueData.name) : '';
  const redirectTo = `${appUrl}/auth/invite?venueId=${venueId}${venueName ? `&venueName=${venueName}` : ''}`;

  // Resend invite email via Supabase admin
  const { error: resendError } = await adminClient.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo }
  );

  // Supabase may return a 422 "database error" when user already exists — that's fine for resend
  if (resendError) {
    const isExpectedError =
      resendError.message?.toLowerCase().includes('database error saving new user') ||
      resendError.message?.toLowerCase().includes('user already registered') ||
      resendError.status === 422;

    if (!isExpectedError) {
      console.error('Resend invite error:', resendError);
      return new Response(JSON.stringify({ error: resendError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Update tracking fields
  const { error: updateError } = await adminClient
    .from('venue_invites')
    .update({
      last_sent_at: new Date().toISOString(),
      send_count: (pendingInvite.send_count ?? 0) + 1,
    })
    .eq('id', pendingInvite.id);

  if (updateError) {
    console.error('Failed to update invite tracking:', updateError);
    // Non-fatal
  }

  return new Response(JSON.stringify({ ok: true, message: 'Invite resent successfully' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
