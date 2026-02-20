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
  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const callerId = callerUser.id;

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

  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists in auth
  const { data: existingUsersData, error: listError } = await adminClient.auth.admin.listUsers();
  let existingUser = null;
  if (!listError && existingUsersData?.users) {
    existingUser = existingUsersData.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );
  }

  let resultUserId: string | undefined;

  if (existingUser) {
    // User already exists — add them directly to the venue without sending another invite email
    const { error: memberInsertError } = await adminClient
      .from('venue_members')
      .upsert(
        { venue_id: venueId, user_id: existingUser.id, role },
        { onConflict: 'venue_id,user_id' }
      );

    if (memberInsertError) {
      console.error('Member insert error:', memberInsertError);
      return new Response(JSON.stringify({ error: 'Failed to add existing user to venue' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    resultUserId = existingUser.id;
    console.log('Existing user added directly to venue:', normalizedEmail);
  } else {
    // New user — send Supabase invite email
    const appUrl =
      Deno.env.get('APP_URL') ||
      req.headers.get('origin') ||
      req.headers.get('referer')?.replace(/\/$/, '') ||
      'https://pulseai-app.lovable.app';

    const redirectTo = `${appUrl}/auth?invite=1`;

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo }
    );

    if (inviteError) {
      console.error('Invite error:', inviteError);
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    resultUserId = inviteData?.user?.id;
  }

  // Upsert into venue_invites to track the invite/addition
  const { error: upsertError } = await adminClient
    .from('venue_invites')
    .upsert(
      {
        venue_id: venueId,
        email: normalizedEmail,
        role,
        invited_by: callerId,
        accepted_at: existingUser ? new Date().toISOString() : null,
        accepted_by: existingUser ? existingUser.id : null,
      },
      { onConflict: 'venue_id,email' }
    );

  if (upsertError) {
    console.error('Upsert invite error:', upsertError);
    // Non-fatal — continue
  }

  const message = existingUser
    ? 'User already exists and has been added to the venue'
    : 'Invite email sent successfully';

  return new Response(JSON.stringify({ ok: true, userId: resultUserId, message }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
