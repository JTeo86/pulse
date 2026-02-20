import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // Caller client — uses caller's JWT to verify auth + membership
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify caller is authenticated
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const callerId = claimsData.claims.sub;

  let body: { venueId: string; email: string; role: 'admin' | 'staff' };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { venueId, email, role } = body;
  if (!venueId || !email || !role) {
    return new Response(JSON.stringify({ error: 'venueId, email, and role are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!['admin', 'staff'].includes(role)) {
    return new Response(JSON.stringify({ error: 'role must be admin or staff' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check caller is an admin of this venue
  const { data: membership, error: memberError } = await callerClient
    .from('venue_members')
    .select('id, role')
    .eq('venue_id', venueId)
    .eq('user_id', callerId)
    .eq('role', 'admin')
    .maybeSingle();

  if (memberError || !membership) {
    return new Response(JSON.stringify({ error: 'Forbidden: you are not an admin of this venue' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Admin client — uses service role to send invite email
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Determine redirect URL
  const appUrl =
    Deno.env.get('APP_URL') ||
    req.headers.get('origin') ||
    req.headers.get('referer')?.replace(/\/$/, '') ||
    'https://pulseai-app.lovable.app';

  const redirectTo = `${appUrl}/auth?invite=1`;

  // Send Supabase invite email
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    { redirectTo }
  );

  if (inviteError) {
    console.error('Invite error:', inviteError);
    return new Response(JSON.stringify({ error: inviteError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Upsert into venue_invites (track the pending invite)
  const { error: upsertError } = await adminClient
    .from('venue_invites')
    .upsert(
      {
        venue_id: venueId,
        email: email.toLowerCase().trim(),
        role,
        invited_by: callerId,
        accepted_at: null,
        accepted_by: null,
      },
      { onConflict: 'venue_id,email' }
    );

  if (upsertError) {
    console.error('Upsert invite error:', upsertError);
    // Non-fatal — email was sent, just log the tracking failure
  }

  return new Response(JSON.stringify({ ok: true, userId: inviteData?.user?.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
